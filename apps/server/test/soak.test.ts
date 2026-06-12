import { describe, expect, it } from "vitest";
import { Table, type TableTiming } from "../src/realtime/table";

/**
 * Soak: 5 concurrent bot tables at heavily accelerated timing. The
 * spec's "30 minutes" at real pacing is ~40 hands/table; we run well past
 * that and assert zero errors, all hands settle, and the heap stays flat.
 */
const SOAK_TIMING: TableTiming = {
  actionMs: 200,
  timeBankMs: 100,
  disconnectGraceMs: 50,
  seatHoldMs: 1_000,
  sitOutKickMs: 2_000,
  botDelayMinMs: 1,
  botDelayMaxMs: 2,
  runoutBeatMs: 0,
  showdownBeatMs: 0,
  payoutBeatMs: 0,
  interHandMs: 1,
  waitingPollMs: 10,
};

describe("soak — 5 concurrent tables", () => {
  it("plays 60+ hands per table with no errors and a flat heap", { timeout: 240_000 }, async () => {
    const errors: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
      originalError(...args);
    };

    try {
      const tables: Table[] = [];
      const handCounts = new Map<string, number>();

      for (let i = 0; i < 5; i++) {
        const table = new Table({ name: `Soak ${i}` }, SOAK_TIMING);
        table.addBot("CASUAL", "STANDARD");
        table.addBot("SOLID", "ROCK");
        table.addBot("FISH", "STATION");
        table.addBot("SHARK", "MANIAC");
        table.onHandSettled = (settlement) => {
          handCounts.set(settlement.tableId, (handCounts.get(settlement.tableId) ?? 0) + 1);
          // Per-hand conservation: nets must sum to zero.
          const netSum = settlement.players.reduce((sum, p) => sum + p.net, 0);
          if (netSum !== 0) errors.push([`net sum ${netSum} on ${settlement.tableId}`]);
          // Bot-only hands are never rated.
          if (settlement.rated) errors.push([`bot-only hand marked rated`]);
        };
        tables.push(table);
        table.start();
      }

      if (globalThis.gc) globalThis.gc();
      const heapBefore = process.memoryUsage().heapUsed;

      // Run until every table has settled 60+ hands.
      const start = Date.now();
      while (Date.now() - start < 180_000) {
        const counts = tables.map((t) => handCounts.get(t.id) ?? 0);
        if (counts.every((c) => c >= 60)) break;
        await new Promise((r) => setTimeout(r, 250));
      }

      for (const table of tables) {
        expect(
          handCounts.get(table.id) ?? 0,
          `table ${table.id} hand count`,
        ).toBeGreaterThanOrEqual(60);
        table.close();
      }
      await Promise.all(tables.map((t) => t.waitForClose()));

      if (globalThis.gc) globalThis.gc();
      const heapAfter = process.memoryUsage().heapUsed;
      const growthMb = (heapAfter - heapBefore) / 1024 / 1024;
      console.log(
        `soak: hands=${[...handCounts.values()].join(",")} heap growth ${growthMb.toFixed(1)}MB`,
      );
      // Generous bound — catches real leaks, tolerates allocator noise.
      expect(growthMb).toBeLessThan(64);

      expect(errors, JSON.stringify(errors)).toEqual([]);
    } finally {
      console.error = originalError;
    }
  });
});
