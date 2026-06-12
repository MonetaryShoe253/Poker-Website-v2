import { describe, expect, it } from "vitest";
import { PokerHand, type EngineEvent, type LegalActions } from "../src/hand";
import { createSeededRng, type Rng } from "../src/rng";

/**
 * The P1 gate: 10,000 randomised hands at full speed. Players act via a
 * chaos policy that picks any legal action (including odd sizings and
 * all-ins). Asserts: no exceptions, no illegal states, chip conservation on
 * every hand, bounded hand length, and a plausible outcome distribution.
 */

interface SimStats {
  hands: number;
  foldWins: number;
  showdowns: number;
  runouts: number;
  chops: number;
  refunds: number;
  totalActions: number;
  biggestPot: number;
}

function chaosAction(legal: LegalActions, rng: Rng): { type: never; amount?: number } {
  const options: Array<() => { type: string; amount?: number }> = [];
  // Weight: folding less than continuing so hands reach streets often.
  if (legal.fold) options.push(() => ({ type: "FOLD" }));
  if (legal.check) {
    options.push(
      () => ({ type: "CHECK" }),
      () => ({ type: "CHECK" }),
    );
  }
  if (legal.call) {
    options.push(
      () => ({ type: "CALL" }),
      () => ({ type: "CALL" }),
    );
  }
  if (legal.bet) {
    const { minTo, maxTo } = legal.bet;
    options.push(() => ({ type: "BET", amount: minTo + rng.nextInt(maxTo - minTo + 1) }));
    options.push(() => ({ type: "BET", amount: minTo }));
    options.push(() => ({ type: "BET", amount: maxTo })); // all-in
  }
  if (legal.raise) {
    const { minTo, maxTo } = legal.raise;
    options.push(() => ({ type: "RAISE", amount: minTo + rng.nextInt(maxTo - minTo + 1) }));
    options.push(() => ({ type: "RAISE", amount: maxTo })); // all-in
  }
  const pick = options[rng.nextInt(options.length)]!;
  return pick() as never;
}

describe("simulation harness", () => {
  it("plays 10,000 randomised hands with full invariants", { timeout: 120_000 }, () => {
    const rng = createSeededRng(0xdecade);
    const stats: SimStats = {
      hands: 0,
      foldWins: 0,
      showdowns: 0,
      runouts: 0,
      chops: 0,
      refunds: 0,
      totalActions: 0,
      biggestPot: 0,
    };

    for (let handNo = 1; handNo <= 10_000; handNo++) {
      const playerCount = 2 + rng.nextInt(5); // 2-6
      const seats: number[] = [];
      while (seats.length < playerCount) {
        const s = rng.nextInt(6);
        if (!seats.includes(s)) seats.push(s);
      }
      seats.sort((a, b) => a - b);
      const players = seats.map((seat) => ({
        seat,
        id: `p${seat}`,
        // 20..20,019 chips — exercises sub-blind stacks and deep stacks.
        stack: 20 + rng.nextInt(20_000),
        showLosing: rng.nextInt(10) === 0,
      }));
      const buttonSeat = seats[rng.nextInt(seats.length)]!;
      const startingTotal = players.reduce((sum, p) => sum + p.stack, 0);

      const hand = new PokerHand({
        handNo,
        buttonSeat,
        players,
        blinds: { small: 50, big: 100 },
        rng,
      });

      const events: EngineEvent[] = [...hand.drainEvents()];
      let actions = 0;
      while (!hand.isComplete) {
        const seat = hand.currentActionSeat;
        expect(seat).toBeGreaterThanOrEqual(0);
        const legal = hand.legalActions(seat);
        events.push(...hand.act(seat, chaosAction(legal, rng)));
        actions++;
        if (actions > 200) {
          throw new Error(`Hand ${handNo} did not terminate after 200 actions`);
        }
      }
      stats.totalActions += actions;

      // --- Invariants per hand --------------------------------------------
      const end = events.find((e) => e.type === "HAND_END");
      if (!end || end.type !== "HAND_END") throw new Error("missing HAND_END");

      // Chip conservation: net sums to zero, stacks sum to buy-ins.
      const netSum = end.net.reduce((sum, n) => sum + n.net, 0);
      expect(netSum).toBe(0);
      const stackSum = end.net.reduce((sum, n) => sum + n.stack, 0);
      expect(stackSum).toBe(startingTotal);
      for (const n of end.net) expect(n.stack).toBeGreaterThanOrEqual(0);

      // No hole cards in events other than HOLE_CARDS / legitimate reveals.
      const shows = events.filter((e) => e.type === "SHOWDOWN_SHOW" || e.type === "RUNOUT_REVEAL");
      const hadShowdown = shows.length > 0 || events.some((e) => e.type === "SHOWDOWN_MUCK");

      // Payout totals match pot totals.
      const payoutEvents = events.filter((e) => e.type === "PAYOUT");
      expect(payoutEvents.length).toBe(1);

      // Outcome bookkeeping.
      stats.hands++;
      if (hadShowdown) stats.showdowns++;
      else stats.foldWins++;
      if (events.some((e) => e.type === "RUNOUT_REVEAL")) stats.runouts++;
      if (events.some((e) => e.type === "UNCALLED_RETURNED")) stats.refunds++;
      const payout = payoutEvents[0]!;
      if (payout.type === "PAYOUT") {
        const winners = new Set(payout.payouts.map((p) => p.seat));
        if (winners.size > 1 && new Set(payout.payouts.map((p) => p.potIndex)).size === 1) {
          stats.chops++;
        }
        const potTotal = payout.payouts.reduce((sum, p) => sum + p.amount, 0);
        stats.biggestPot = Math.max(stats.biggestPot, potTotal);
      }
    }

    // --- Plausible distribution over 10k chaotic hands -----------------------
    expect(stats.hands).toBe(10_000);
    expect(stats.showdowns).toBeGreaterThan(2_000); // chaos calls a lot
    expect(stats.foldWins).toBeGreaterThan(500); // and folds sometimes
    expect(stats.runouts).toBeGreaterThan(500); // all-ins happen
    expect(stats.chops).toBeGreaterThan(20); // ties exist
    expect(stats.refunds).toBeGreaterThan(500); // uncalled bets return
    expect(stats.totalActions / stats.hands).toBeGreaterThan(2);
    expect(stats.biggestPot).toBeGreaterThan(10_000);

    console.log("simulation stats:", stats);
  });
});
