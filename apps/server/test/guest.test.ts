import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type { AddressInfo } from "node:net";
import {
  SOCKET_EVENTS as EV,
  type TableErrorPayload,
  type TableStatePayload,
} from "@uos-poker/shared";
import { buildServer } from "../src/server";
import { attachRealtime, type RealtimeHandle } from "../src/realtime/sockets";
import { guestResolveUser } from "../src/realtime/users";
import type { TableTiming } from "../src/realtime/table";

/** Accelerated timing so full hands play out in milliseconds. */
const FAST: TableTiming = {
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

/**
 * Production guest door: an opt-in demo identity restricted to practice tables
 * + spectating. This harness wires the realtime layer with the *production*
 * resolver (guests only, no dev door) so the restriction is exercised exactly
 * as it ships.
 */

interface TestClient {
  socket: ClientSocket;
  states: TableStatePayload[];
  errors: TableErrorPayload[];
  latestState: () => TableStatePayload | undefined;
}

function connect(port: number, auth: Record<string, unknown>): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      auth,
      reconnection: false,
    });
    const client: TestClient = {
      socket,
      states: [],
      errors: [],
      latestState: () => client.states[client.states.length - 1],
    };
    socket.on(EV.tableState, (s: TableStatePayload) => client.states.push(s));
    socket.on(EV.tableError, (e: TableErrorPayload) => client.errors.push(e));
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

describe("guestResolveUser (pure)", () => {
  it("requires the explicit guest flag — a bare nickname is ignored", () => {
    expect(guestResolveUser({ nickname: "Visitor" })).toBeNull();
    expect(guestResolveUser({ nickname: "Visitor", guest: false })).toBeNull();
    expect(guestResolveUser(undefined)).toBeNull();
  });

  it("rejects malformed nicknames even with the flag", () => {
    expect(guestResolveUser({ nickname: "no", guest: true })).toBeNull();
    expect(guestResolveUser({ nickname: "bad name!", guest: true })).toBeNull();
  });

  it("produces an ephemeral, flagged identity for a valid guest", () => {
    const guest = guestResolveUser({ nickname: "Visitor", guest: true });
    expect(guest).toMatchObject({ userId: "guest:visitor", nickname: "Visitor", isGuest: true });
  });
});

describe("guest realtime restrictions", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let realtime: RealtimeHandle;
  let port: number;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
    realtime = attachRealtime(app.server, {
      timing: FAST,
      scalingIntervalMs: 60_000,
      // Production-like: guests only, no dev door.
      resolveUser: (h) => guestResolveUser(h.auth),
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    port = (app.server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    realtime.lobby.stop();
    await realtime.io.close();
    await app.close();
  });

  it("blocks guests from rated play (playNow)", async () => {
    const guest = await connect(port, { nickname: "Visitor", guest: true });
    guest.socket.emit(EV.playNow);
    await until(
      () => guest.errors.find((e) => e.code === "NOT_AUTHENTICATED"),
      4000,
      "rated-play rejection",
    );
    // And they were never seated at a public table.
    expect(guest.states.find((s) => s.mySeat !== null)).toBeUndefined();
    guest.socket.disconnect();
  });

  it("lets guests play practice tables vs bots", async () => {
    const guest = await connect(port, { nickname: "Practiser", guest: true });
    guest.socket.emit(EV.practice, { tier: "CASUAL", botCount: 3 });
    const seated = await until(
      () => guest.states.find((s) => s.mySeat !== null),
      6000,
      "guest seated at practice",
    );
    expect(seated.mySeat).not.toBeNull();
    // No authentication errors on the practice path.
    expect(guest.errors.find((e) => e.code === "NOT_AUTHENTICATED")).toBeUndefined();
    guest.socket.disconnect();
  });

  it("treats a nickname without the guest flag as an anonymous spectator", async () => {
    const anon = await connect(port, { nickname: "NoFlag" });
    anon.socket.emit(EV.playNow);
    await until(
      () => anon.errors.find((e) => e.code === "NOT_AUTHENTICATED"),
      4000,
      "anonymous rejection",
    );
    anon.socket.disconnect();
  });
});
