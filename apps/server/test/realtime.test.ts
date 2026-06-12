import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type { AddressInfo } from "node:net";
import {
  SOCKET_EVENTS as EV,
  type LobbyStatePayload,
  type TableErrorPayload,
  type TableEventPayload,
  type TableStatePayload,
} from "@uos-poker/shared";
import { buildServer } from "../src/server";
import { attachRealtime, type RealtimeHandle } from "../src/realtime/sockets";
import type { TableTiming } from "../src/realtime/table";

/** Accelerated timing so full hands play out in milliseconds. */
export const FAST: TableTiming = {
  actionMs: 400,
  timeBankMs: 200,
  disconnectGraceMs: 100,
  seatHoldMs: 1_500,
  sitOutKickMs: 3_000,
  botDelayMinMs: 1,
  botDelayMaxMs: 5,
  runoutBeatMs: 1,
  showdownBeatMs: 1,
  payoutBeatMs: 1,
  interHandMs: 40,
  waitingPollMs: 25,
};

interface TestClient {
  socket: ClientSocket;
  states: TableStatePayload[];
  events: TableEventPayload[];
  errors: TableErrorPayload[];
  lobby: LobbyStatePayload[];
  latestState: () => TableStatePayload | undefined;
}

const CARD_RE = /^[2-9TJQKA][cdhs]$/;

function connectClient(port: number, nickname?: string): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      auth: nickname ? { nickname } : {},
      reconnection: false,
    });
    const client: TestClient = {
      socket,
      states: [],
      events: [],
      errors: [],
      lobby: [],
      latestState: () => client.states[client.states.length - 1],
    };
    socket.on(EV.tableState, (s: TableStatePayload) => client.states.push(s));
    socket.on(EV.tableEvent, (e: TableEventPayload) => client.events.push(e));
    socket.on(EV.tableError, (e: TableErrorPayload) => client.errors.push(e));
    socket.on(EV.lobbyState, (l: LobbyStatePayload) => client.lobby.push(l));
    socket.on("connect", () => resolve(client));
    socket.on("connect_error", reject);
  });
}

async function until<T>(probe: () => T | undefined | false, ms = 8000, what = "condition"): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const value = probe();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

/** Auto-player: checks when free, calls small bets, folds big ones. */
function autoplay(client: TestClient): void {
  client.socket.on(EV.tableState, (state: TableStatePayload) => {
    if (state.myLegal && state.mySeat !== null && state.actionSeat === state.mySeat) {
      const legal = state.myLegal;
      const base = { tableId: state.tableId, handNo: state.handNo, seq: state.seq };
      if (legal.check) {
        client.socket.emit(EV.action, { ...base, action: "CHECK" });
      } else if (legal.call && legal.call.amount <= 400) {
        client.socket.emit(EV.action, { ...base, action: "CALL" });
      } else {
        client.socket.emit(EV.action, { ...base, action: "FOLD" });
      }
    }
  });
}

let app: Awaited<ReturnType<typeof buildServer>>;
let realtime: RealtimeHandle;
let port: number;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
  realtime = attachRealtime(app.server, { timing: FAST, scalingIntervalMs: 60_000 });
  await app.listen({ port: 0, host: "127.0.0.1" });
  port = (app.server.address() as AddressInfo).port;
});

afterAll(async () => {
  realtime.lobby.stop();
  await realtime.io.close();
  await app.close();
});

describe("lobby & seating", () => {
  it("publishes a lobby with at least one public table", async () => {
    const client = await connectClient(port, "LobbyLurker");
    client.socket.emit(EV.lobbySubscribe);
    const lobby = await until(() => client.lobby[client.lobby.length - 1], 4000, "lobby state");
    expect(lobby.tables.length).toBeGreaterThanOrEqual(1);
    client.socket.disconnect();
  });

  it("playNow seats a human, bots top up, and full hands complete", async () => {
    const alice = await connectClient(port, "Alice");
    autoplay(alice);
    alice.socket.emit(EV.playNow);

    const seated = await until(
      () => alice.states.find((s) => s.mySeat !== null),
      6000,
      "Alice to be seated",
    );
    expect(seated.mySeat).not.toBeNull();

    // Bots fill in and are badged.
    const withBots = await until(() => {
      const s = alice.latestState();
      return s && s.seats.filter((x) => x?.isBot).length >= 2 ? s : undefined;
    }, 6000, "bots to fill the table");
    for (const seat of withBots.seats) {
      if (seat?.isBot) expect(seat.botTier).toBeDefined();
    }

    // Alice gets exactly two hole cards while dealt in.
    const withCards = await until(
      () => alice.states.find((s) => s.myCards !== null && s.myCards.length === 2),
      8000,
      "Alice to receive hole cards",
    );
    expect(withCards.myCards![0]).toMatch(CARD_RE);

    // At least two full hands complete.
    await until(
      () => alice.events.filter((e) => e.event.kind === "HAND_END").length >= 2,
      15000,
      "two hands to complete",
    );

    // She was offered only legal action sets, and no errors arrived.
    expect(alice.errors).toEqual([]);
    alice.socket.disconnect();
  });
});

describe("sanitisation — the non-negotiable", () => {
  it("no payload ever contains hole cards that were not legitimately visible", async () => {
    const carol = await connectClient(port, "Carol");
    autoplay(carol);
    carol.socket.emit(EV.playNow);
    await until(() => carol.states.find((s) => s.mySeat !== null), 6000, "Carol seated");

    // Spectator watches the same table.
    const tableId = carol.latestState()!.tableId;
    const peeper = await connectClient(port); // unauthenticated spectator
    peeper.socket.emit(EV.joinTable, { tableId });

    await until(
      () => peeper.events.filter((e) => e.event.kind === "HAND_END").length >= 3,
      20000,
      "three hands as spectator",
    );

    // Spectators never receive a mySeat / myCards.
    for (const state of peeper.states) {
      expect(state.mySeat).toBeNull();
      expect(state.myCards).toBeNull();
    }

    // Scan every payload: any card token must be on the board, in the
    // viewer's own hand, or legitimately revealed at that moment.
    const checkPayloads = (client: TestClient, who: string) => {
      for (const state of client.states) {
        const allowed = new Set<string>([
          ...state.board,
          ...(state.myCards ?? []),
          ...Object.values(state.revealed).flat(),
        ]);
        const tokens = JSON.stringify(state).match(/"[2-9TJQKA][cdhs]"/g) ?? [];
        for (const token of tokens) {
          const card = token.slice(1, -1);
          expect(allowed.has(card), `${who} saw unexpected card ${card}`).toBe(true);
        }
      }
    };
    checkPayloads(peeper, "spectator");
    checkPayloads(carol, "player");

    carol.socket.disconnect();
    peeper.socket.disconnect();
  });
});

describe("illegal input is rejected with typed errors", () => {
  it("rejects unauthenticated play, stale seqs, and tampered amounts", async () => {
    const anon = await connectClient(port);
    anon.socket.emit(EV.playNow);
    await until(() => anon.errors.find((e) => e.code === "NOT_AUTHENTICATED"), 4000, "auth error");

    const dave = await connectClient(port, "Dave");
    dave.socket.emit(EV.playNow);
    const seated = await until(() => dave.states.find((s) => s.mySeat !== null), 6000, "Dave seated");

    // Stale handNo/seq.
    dave.socket.emit(EV.action, {
      tableId: seated.tableId,
      handNo: 9999,
      seq: 9999,
      action: "FOLD",
    });
    await until(() => dave.errors.find((e) => e.code === "STALE_ACTION"), 4000, "stale error");

    // Tampered amount on his real turn.
    const myTurn = await until(() => {
      const s = dave.latestState();
      return s && s.myLegal && s.actionSeat === s.mySeat ? s : undefined;
    }, 10000, "Dave's turn");
    dave.socket.emit(EV.action, {
      tableId: myTurn.tableId,
      handNo: myTurn.handNo,
      seq: myTurn.seq,
      action: "RAISE",
      amount: 99_999_999,
    });
    await until(
      () => dave.errors.find((e) => e.code === "BAD_AMOUNT" || e.code === "CANNOT_RAISE"),
      4000,
      "amount rejection",
    );

    anon.socket.disconnect();
    dave.socket.disconnect();
  });
});
