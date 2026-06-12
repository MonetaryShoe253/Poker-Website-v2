import { describe, expect, it } from "vitest";
import { BOT_TIERS, type BotTier } from "@uos-poker/shared";
import { cardsFromString } from "../src/cards";
import { preflopPercentile } from "../src/bots/preflop";
import { detectDraws } from "../src/bots/equity";
import { playBotHand } from "../src/bots/runner";
import { createSeededRng } from "../src/rng";

const BLINDS = { small: 50, big: 100 };

describe("preflop percentile table", () => {
  it("orders the classics correctly", () => {
    const pct = (s: string) => preflopPercentile(cardsFromString(s));
    expect(pct("As Ad")).toBeGreaterThan(0.98); // aces are the nuts
    expect(pct("As Ad")).toBeGreaterThan(pct("Ks Kd"));
    expect(pct("Ks Kd")).toBeGreaterThan(pct("As Ks"));
    expect(pct("As Ks")).toBeGreaterThan(pct("As Kd")); // suited > offsuit
    expect(pct("As Kd")).toBeGreaterThan(pct("9s 8s"));
    expect(pct("7s 2d")).toBeLessThan(0.12); // the worst hand in poker
  });
});

describe("draw detection", () => {
  const draws = (hole: string, board: string) =>
    detectDraws(cardsFromString(hole), cardsFromString(board));

  it("spots flush draws (requires a hole card of the suit)", () => {
    expect(draws("Ah Kh", "7h 2h 9c").flushDraw).toBe(true);
    expect(draws("Ac Kd", "7h 2h 9h").flushDraw).toBe(false); // board-only
    expect(draws("Ah Kc", "7h 2h 9h").flushDraw).toBe(true);
  });

  it("spots open-ended and gutshot straight draws", () => {
    expect(draws("9c 8d", "7h 6s 2c").openEnded).toBe(true);
    expect(draws("9c 8d", "7h 5s 2c").gutshot).toBe(true); // needs a six
    expect(draws("Ac Kd", "Qh Js 2c").gutshot).toBe(true); // needs a ten
    expect(draws("Ac 2d", "3h 4s 9c").gutshot).toBe(true); // wheel draw needs a five
    expect(draws("Kc 2d", "7h 8s 2c").openEnded).toBe(false);
  });

  it("spots made pairs", () => {
    expect(draws("Ah Kc", "Ad 7s 2c").pairOrBetter).toBe(true);
    expect(draws("Ah Kc", "Qd 7s 2c").pairOrBetter).toBe(false);
    expect(draws("Ah Kc", "7d 7s 2c").pairOrBetter).toBe(true); // board pair counts (fish logic)
  });
});

/** Play N hands of 6 same-tier bots; return measured VPIP/PFR/aggression. */
function measureTier(tier: BotTier, hands: number, seed: number) {
  const rng = createSeededRng(seed);
  let vpipCount = 0;
  let pfrCount = 0;
  let opportunities = 0;
  let aggressive = 0;
  let passive = 0;
  for (let h = 0; h < hands; h++) {
    const stats = playBotHand({
      seats: [0, 1, 2, 3, 4, 5].map((seat) => ({ seat, tier, stack: 10_000 })),
      buttonSeat: h % 6,
      blinds: BLINDS,
      rng,
      rollouts: 40,
    });
    for (const [, vpip] of stats.vpipBySeat) {
      opportunities++;
      if (vpip) vpipCount++;
    }
    for (const [, pfr] of stats.pfrBySeat) if (pfr) pfrCount++;
    for (const [, agg] of stats.aggActsBySeat) {
      aggressive += agg.aggressive;
      passive += agg.passive;
    }
  }
  return {
    vpip: vpipCount / opportunities,
    pfr: pfrCount / opportunities,
    aggressionFactor: aggressive / Math.max(1, passive),
  };
}

describe("statistical tier validation (the P2 bot gate)", () => {
  const HANDS = 5_000;

  it("each tier lands within ±5pts of its VPIP/PFR targets over 5,000 hands", { timeout: 600_000 }, () => {
    const results: Record<string, { vpip: number; pfr: number; aggressionFactor: number }> = {};
    for (const tier of ["FISH", "CASUAL", "SOLID", "SHARK"] as const) {
      const measured = measureTier(tier, HANDS, 0xb07 + tier.length);
      results[tier] = measured;
      const target = BOT_TIERS[tier];
      expect(
        Math.abs(measured.vpip - target.vpip),
        `${tier} VPIP ${(measured.vpip * 100).toFixed(1)} vs target ${target.vpip * 100}`,
      ).toBeLessThanOrEqual(0.05);
      expect(
        Math.abs(measured.pfr - target.pfr),
        `${tier} PFR ${(measured.pfr * 100).toFixed(1)} vs target ${target.pfr * 100}`,
      ).toBeLessThanOrEqual(0.05);
    }
    console.log("tier validation:", JSON.stringify(results, null, 2));

    // Aggression ordering: the strong tiers play more aggressively postflop.
    expect(results.SHARK!.aggressionFactor).toBeGreaterThan(results.CASUAL!.aggressionFactor);
    expect(results.SOLID!.aggressionFactor).toBeGreaterThan(results.CASUAL!.aggressionFactor);
    expect(results.CASUAL!.aggressionFactor).toBeGreaterThan(results.FISH!.aggressionFactor);
  });

  it("win rates order Shark > Solid > Casual > Fish over 10,000 mixed hands", { timeout: 900_000 }, () => {
    const rng = createSeededRng(0x0ddba11);
    const tiers: BotTier[] = ["FISH", "CASUAL", "SOLID", "SHARK"];
    const net: Record<BotTier, number> = { FISH: 0, CASUAL: 0, SOLID: 0, SHARK: 0 };
    for (let h = 0; h < 10_000; h++) {
      // Rotate seats so no tier owns a position.
      const offset = h % 4;
      const seats = tiers.map((tier, i) => ({
        seat: (i + offset) % 4,
        tier,
        stack: 10_000,
      }));
      const stats = playBotHand({
        seats,
        buttonSeat: h % 4,
        blinds: BLINDS,
        rng,
        rollouts: 40,
      });
      for (const seatConfig of seats) {
        net[seatConfig.tier] += stats.netBySeat.get(seatConfig.seat)!;
      }
    }
    console.log("win rates (chips over 10k hands):", net);
    expect(net.SHARK).toBeGreaterThan(net.SOLID);
    expect(net.SOLID).toBeGreaterThan(net.CASUAL);
    expect(net.CASUAL).toBeGreaterThan(net.FISH);
  });
});
