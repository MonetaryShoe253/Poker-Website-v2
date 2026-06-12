import { describe, expect, it } from "vitest";
import {
  cardFromString,
  cardToString,
  cardsFromString,
  freshDeck,
  makeCard,
  rankOf,
  suitOf,
} from "../src/cards";
import { createCryptoRng, createSeededRng, shuffleInPlace } from "../src/rng";

describe("card packing", () => {
  it("round-trips all 52 cards through the wire format", () => {
    for (const c of freshDeck()) {
      expect(cardFromString(cardToString(c))).toBe(c);
    }
  });

  it("packs rank-major", () => {
    const aceOfSpades = cardFromString("As");
    expect(rankOf(aceOfSpades)).toBe(12);
    expect(suitOf(aceOfSpades)).toBe(3);
    expect(makeCard(0, 0)).toBe(cardFromString("2c"));
  });

  it("parses space-separated card lists", () => {
    expect(cardsFromString("As Kd 2c")).toEqual([
      cardFromString("As"),
      cardFromString("Kd"),
      cardFromString("2c"),
    ]);
  });

  it("rejects garbage", () => {
    expect(() => cardFromString("Xx")).toThrow();
    expect(() => cardFromString("A")).toThrow();
    expect(() => cardFromString("10c")).toThrow();
  });
});

describe("rng + shuffle", () => {
  it("seeded rng is deterministic", () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    for (let i = 0; i < 100; i++) {
      expect(a.nextInt(52)).toBe(b.nextInt(52));
    }
  });

  it("shuffle is a permutation (seeded)", () => {
    const deck = shuffleInPlace(freshDeck(), createSeededRng(7));
    expect([...deck].sort((x, y) => x - y)).toEqual(freshDeck());
  });

  it("shuffle is a permutation (crypto)", () => {
    const deck = shuffleInPlace(freshDeck(), createCryptoRng());
    expect([...deck].sort((x, y) => x - y)).toEqual(freshDeck());
  });

  it("crypto rng stays in bounds across refills", () => {
    const rng = createCryptoRng();
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });

  it("seeded shuffle distribution is roughly uniform per position", () => {
    // 52 positions × 2,000 shuffles; first card should land near-uniform.
    const counts = new Array<number>(52).fill(0);
    for (let s = 0; s < 2000; s++) {
      const deck = shuffleInPlace(freshDeck(), createSeededRng(s + 1));
      counts[deck[0]!]!++;
    }
    const expected = 2000 / 52;
    for (const c of counts) {
      expect(c).toBeGreaterThan(expected * 0.4);
      expect(c).toBeLessThan(expected * 1.9);
    }
  });
});
