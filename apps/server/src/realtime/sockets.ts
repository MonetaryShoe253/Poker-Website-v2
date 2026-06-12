import { Server, type Socket } from "socket.io";
import type { Server as HttpServer } from "node:http";
import {
  ChatSchema,
  JoinTableSchema,
  PracticeSchema,
  SitDownSchema,
  TableActionSchema,
  SOCKET_EVENTS as EV,
  CHAT_RATE,
  type TableErrorPayload,
} from "@uos-poker/shared";
import { Lobby } from "./lobby";
import type { Table, TableTiming } from "./table";
import { DEFAULT_TIMING } from "./table";
import { devResolveUser, type UserCtx } from "./users";
import { filterProfanity } from "../moderation";

/**
 * Socket.IO wiring. Every inbound payload is zod-validated; every outbound
 * table payload is personalised by Table.buildState (own hole cards only).
 */

interface SocketCtx {
  user: UserCtx | null;
  watchingTableId: string | null;
  actionTokens: number;
  lastActionRefill: number;
  chatTimestamps: number[];
}

export interface RealtimeHandle {
  io: Server;
  lobby: Lobby;
}

export function attachRealtime(
  httpServer: HttpServer,
  opts: {
    timing?: TableTiming;
    scalingIntervalMs?: number;
    resolveUser?: (auth: Record<string, unknown> | undefined) => Promise<UserCtx | null> | UserCtx | null;
    corsOrigin?: string | boolean;
  } = {},
): RealtimeHandle {
  const io = new Server(httpServer, {
    cors: { origin: opts.corsOrigin ?? true, credentials: true },
  });
  const lobby = new Lobby(opts.timing ?? DEFAULT_TIMING);
  const resolveUser = opts.resolveUser ?? devResolveUser;
  const contexts = new Map<string, SocketCtx>();

  const broadcastLobby = throttle(() => {
    io.to("lobby").emit(EV.lobbyState, lobby.buildLobbyState(io.engine.clientsCount));
  }, 1000);
  lobby.onChanged = broadcastLobby;

  lobby.onTableCreated = (table: Table) => {
    table.errorSink = (userId, code, message) => {
      for (const [socketId, ctx] of contexts) {
        if (ctx.user?.userId === userId && ctx.watchingTableId === table.id) {
          io.to(socketId).emit(EV.tableError, { code, message } satisfies TableErrorPayload);
        }
      }
    };
  };

  lobby.start(opts.scalingIntervalMs ?? 10_000);

  io.on("connection", async (socket: Socket) => {
    const user = await resolveUser(socket.handshake.auth as Record<string, unknown> | undefined);
    const ctx: SocketCtx = {
      user,
      watchingTableId: null,
      actionTokens: 10,
      lastActionRefill: Date.now(),
      chatTimestamps: [],
    };
    contexts.set(socket.id, ctx);

    const sendError = (payload: TableErrorPayload) => socket.emit(EV.tableError, payload);
    const requireAuth = (): UserCtx | null => {
      if (!ctx.user) {
        sendError({ code: "NOT_AUTHENTICATED", message: "Sign in to play." });
        return null;
      }
      return ctx.user;
    };
    const takeActionToken = (): boolean => {
      const now = Date.now();
      ctx.actionTokens = Math.min(10, ctx.actionTokens + ((now - ctx.lastActionRefill) / 1000) * 5);
      ctx.lastActionRefill = now;
      if (ctx.actionTokens < 1) {
        sendError({ code: "RATE_LIMITED", message: "Slow down a little." });
        return false;
      }
      ctx.actionTokens -= 1;
      return true;
    };

    const leaveCurrentTable = () => {
      if (!ctx.watchingTableId) return;
      const table = lobby.get(ctx.watchingTableId);
      table?.removeViewer(socket.id);
      void socket.leave(`table:${ctx.watchingTableId}`);
      ctx.watchingTableId = null;
    };

    const watchTable = (table: Table) => {
      leaveCurrentTable();
      ctx.watchingTableId = table.id;
      void socket.join(`table:${table.id}`);
      table.addViewer({
        socketId: socket.id,
        userId: ctx.user?.userId ?? null,
        emitState: (state) => socket.emit(EV.tableState, state),
        emitEvent: (event) => socket.emit(EV.tableEvent, event),
      });
    };

    socket.on(EV.lobbySubscribe, () => {
      void socket.join("lobby");
      socket.emit(EV.lobbyState, lobby.buildLobbyState(io.engine.clientsCount));
    });
    socket.on(EV.lobbyUnsubscribe, () => void socket.leave("lobby"));

    socket.on(EV.joinTable, (raw: unknown) => {
      const parsed = JoinTableSchema.safeParse(raw);
      if (!parsed.success) return;
      const table = lobby.get(parsed.data.tableId);
      if (!table) {
        return sendError({ code: "TABLE_NOT_FOUND", message: "That table no longer exists." });
      }
      if (table.isPractice && table.ownerUserId !== ctx.user?.userId) {
        return sendError({ code: "TABLE_NOT_FOUND", message: "That table is private." });
      }
      watchTable(table);
    });

    socket.on(EV.leaveTable, () => leaveCurrentTable());

    socket.on(EV.playNow, () => {
      const user = requireAuth();
      if (!user) return;
      const table = lobby.playNowTarget();
      watchTable(table);
      const result = table.sitDown({
        userId: user.userId,
        nickname: user.nickname,
        avatarId: user.avatarId,
        buyIn: 10_000,
      });
      if (!result.ok) {
        sendError({ code: result.code as TableErrorPayload["code"], message: result.message });
      }
    });

    socket.on(EV.practice, (raw: unknown) => {
      const user = requireAuth();
      if (!user) return;
      const parsed = PracticeSchema.safeParse(raw);
      if (!parsed.success) return;
      const table = lobby.createPracticeTable(user.userId, parsed.data.tier, parsed.data.botCount);
      watchTable(table);
      const result = table.sitDown({
        userId: user.userId,
        nickname: user.nickname,
        avatarId: user.avatarId,
        buyIn: 10_000,
      });
      if (!result.ok) {
        sendError({ code: result.code as TableErrorPayload["code"], message: result.message });
      }
    });

    socket.on(EV.sitDown, (raw: unknown) => {
      const user = requireAuth();
      if (!user) return;
      const parsed = SitDownSchema.safeParse(raw);
      if (!parsed.success) {
        return sendError({ code: "BAD_ACTION", message: "Invalid sit-down request." });
      }
      const table = lobby.get(parsed.data.tableId);
      if (!table) {
        return sendError({ code: "TABLE_NOT_FOUND", message: "That table no longer exists." });
      }
      if (ctx.watchingTableId !== table.id) watchTable(table);
      const result = table.sitDown({
        userId: user.userId,
        nickname: user.nickname,
        avatarId: user.avatarId,
        buyIn: parsed.data.buyIn,
        ...(parsed.data.seat !== undefined ? { seat: parsed.data.seat } : {}),
      });
      if (!result.ok) {
        sendError({ code: result.code as TableErrorPayload["code"], message: result.message });
      }
    });

    socket.on(EV.standUp, () => {
      const user = ctx.user;
      if (!user || !ctx.watchingTableId) return;
      const table = lobby.get(ctx.watchingTableId);
      table?.standUp(user.userId);
      if (table && table.isPractice && table.ownerUserId === user.userId) {
        lobby.ownerLeft(table);
      }
    });

    socket.on(EV.action, (raw: unknown) => {
      if (!takeActionToken()) return;
      const user = requireAuth();
      if (!user) return;
      const parsed = TableActionSchema.safeParse(raw);
      if (!parsed.success) {
        return sendError({ code: "BAD_ACTION", message: "Malformed action." });
      }
      const table = lobby.get(parsed.data.tableId);
      if (!table) {
        return sendError({ code: "TABLE_NOT_FOUND", message: "That table no longer exists." });
      }
      const result = table.submitAction(user.userId, parsed.data);
      if (!result.ok) {
        sendError({ code: result.code as TableErrorPayload["code"], message: result.message });
      }
    });

    socket.on(EV.imBack, () => {
      const user = ctx.user;
      if (!user || !ctx.watchingTableId) return;
      lobby.get(ctx.watchingTableId)?.imBack(user.userId);
    });

    socket.on(EV.chat, (raw: unknown) => {
      const user = requireAuth();
      if (!user) return;
      const parsed = ChatSchema.safeParse(raw);
      if (!parsed.success) return;
      const now = Date.now();
      ctx.chatTimestamps = ctx.chatTimestamps.filter((t) => now - t < CHAT_RATE.perMs);
      if (ctx.chatTimestamps.length >= CHAT_RATE.messages) {
        return sendError({ code: "RATE_LIMITED", message: "Chat slower." });
      }
      ctx.chatTimestamps.push(now);
      const table = lobby.get(parsed.data.tableId);
      if (!table || ctx.watchingTableId !== table.id) return;
      io.to(`table:${table.id}`).emit(EV.tableChat, {
        tableId: table.id,
        nickname: user.nickname,
        message: filterProfanity(parsed.data.message),
        at: now,
      });
    });

    socket.on("disconnect", () => {
      leaveCurrentTable();
      contexts.delete(socket.id);
      broadcastLobby();
    });

    broadcastLobby();
  });

  return { io, lobby };
}

function throttle(fn: () => void, ms: number): () => void {
  let last = 0;
  let scheduled = false;
  return () => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn();
    } else if (!scheduled) {
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        last = Date.now();
        fn();
      }, ms - (now - last));
    }
  };
}
