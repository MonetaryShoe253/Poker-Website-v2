import { describe, expect, it } from "vitest";
import { computeEloDeltas, kFactorFor, type EloParticipant } from "../src/elo";

const human = (id: string, rating: number, net: number, ratedHands = 100): EloParticipant => ({
  id,
  rating,
  net,
  anchored: false,
  ratedHands,
});
const bot = (id: string, rating: number, net: number): EloParticipant => ({
  id,
  rating,
  net,
  anchored: true,
  ratedHands: 0,
});

describe("elo (§14)", () => {
  it("matches the worked example: 1000 beats anchored 1200 heads-up, K=8", () => {
    // E = 1/(1+10^0.5) ≈ 0.2403; Δ = 8 × 0.7597 ≈ +6.08
    const deltas = computeEloDeltas([human("h", 1000, +500), bot("b", 1200, -500)]);
    expect(deltas.get("h")!).toBeCloseTo(6.078, 2);
    expect(deltas.get("b")).toBe(0); // anchors never move
  });

  it("scales K by (n−1) across multiple opponents", () => {
    // Three players, the human beats two equal-rated anchors:
    // each pairwise Δ = (8/2) × (1 − 0.5) = 2 → total +4.
    const deltas = computeEloDeltas([
      human("h", 1000, +900),
      bot("b1", 1000, -450),
      bot("b2", 1000, -450),
    ]);
    expect(deltas.get("h")!).toBeCloseTo(4, 6);
  });

  it("is pairwise-symmetric between equal humans (zero-sum at equal K)", () => {
    const deltas = computeEloDeltas([human("a", 1100, +300), human("b", 1100, -300)]);
    expect(deltas.get("a")!).toBeCloseTo(-deltas.get("b")!, 9);
    expect(deltas.get("a")!).toBeCloseTo(4, 6); // 8 × (1 − 0.5)
  });

  it("ties count half", () => {
    const deltas = computeEloDeltas([human("a", 1000, 0), human("b", 1000, 0)]);
    expect(deltas.get("a")).toBeCloseTo(0, 9);
    expect(deltas.get("b")).toBeCloseTo(0, 9);
  });

  it("uses provisional K=24 for the first 30 rated hands, then K=8", () => {
    expect(kFactorFor(0)).toBe(24);
    expect(kFactorFor(29)).toBe(24);
    expect(kFactorFor(30)).toBe(8);
    const fresh = computeEloDeltas([human("h", 1000, +1, 0), bot("b", 1000, -1)]);
    const veteran = computeEloDeltas([human("h", 1000, +1, 30), bot("b", 1000, -1)]);
    expect(fresh.get("h")!).toBeCloseTo(3 * veteran.get("h")!, 9);
  });

  it("anchors are immutable in every direction", () => {
    const deltas = computeEloDeltas([
      bot("fish", 800, +2000),
      bot("shark", 1400, -1000),
      human("h", 1000, -1000),
    ]);
    expect(deltas.get("fish")).toBe(0);
    expect(deltas.get("shark")).toBe(0);
    expect(deltas.get("h")!).toBeLessThan(0);
  });

  it("grinding fish bots from a high rating yields vanishing gains", () => {
    // A 1300-rated regular beating an 800 fish heads-up:
    // E ≈ 1/(1+10^-1.25) ≈ 0.947 → Δ ≈ 8 × 0.053 ≈ +0.42 per hand.
    const deltas = computeEloDeltas([human("h", 1300, +500), bot("fish", 800, -500)]);
    expect(deltas.get("h")!).toBeGreaterThan(0);
    expect(deltas.get("h")!).toBeLessThan(0.45);
  });

  it("applies the rating floor at 100", () => {
    const deltas = computeEloDeltas([human("h", 101, -500, 0), bot("b", 1400, +500)]);
    expect(101 + deltas.get("h")!).toBeGreaterThanOrEqual(100);
  });

  it("net chip ordering decides scores, not pot wins", () => {
    // Bigger net beats smaller net even when both are positive.
    const deltas = computeEloDeltas([
      human("big", 1000, +800),
      human("small", 1000, +200),
      human("loser", 1000, -1000),
    ]);
    expect(deltas.get("big")!).toBeGreaterThan(deltas.get("small")!);
    expect(deltas.get("loser")!).toBeLessThan(0);
  });
});
