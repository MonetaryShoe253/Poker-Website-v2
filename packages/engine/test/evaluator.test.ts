import { describe, expect, it } from "vitest";
import { cardsFromString, freshDeck, rankOf, suitOf, type CardInt } from "../src/cards";
import { describeHand, evaluate } from "../src/evaluator";
import { createSeededRng, shuffleInPlace } from "../src/rng";

const v = (s: string) => evaluate(cardsFromString(s));

describe("hand categories", () => {
  const cases: Array<[string, number, string]> = [
    ["As Ks Qs Js Ts 2c 3d", 8, "Royal flush"],
    ["9h 8h 7h 6h 5h Ac Ad", 8, "Straight flush — Nine high"],
    ["Ah 2h 3h 4h 5h Kc Qd", 8, "Straight flush — Five high"],
    ["Ac Ad Ah As Kc 2d 3h", 7, "Four of a kind — Aces"],
    ["2c 2d 2h 2s 3c 4d 5h", 7, "Four of a kind — Twos"],
    ["Kc Kd Kh 9s 9c 2d 3h", 6, "Full house — Kings full of Nines"],
    ["Ah Kh 9h 5h 2h Ac Kd", 5, "Flush — Ace high"],
    ["Tc 9d 8h 7s 6c Ad Kh", 4, "Straight — Ten high"],
    ["Ac 2d 3h 4s 5c Kd Qh", 4, "Straight — Five high"],
    ["Qc Qd Qh 9s 7c 4d 2h", 3, "Three of a kind — Queens"],
    ["Kc Kd 9h 9s Ac 4d 2h", 2, "Two pair — Kings and Nines"],
    ["6c 6d Ah 9s 7c 4d 2h", 1, "Pair of Sixes"],
    ["Ac Kd 9h 7s 5c 3d 2h", 0, "High card — Ace"],
  ];

  for (const [cards, category, name] of cases) {
    it(`${cards} → ${name}`, () => {
      const hand = v(cards);
      expect(hand.category).toBe(category);
      expect(describeHand(hand)).toBe(name);
      expect(hand.bestFive).toHaveLength(5);
      // bestFive must come from the input cards, no duplicates
      const input = cardsFromString(cards);
      expect(new Set(hand.bestFive).size).toBe(5);
      for (const c of hand.bestFive) expect(input).toContain(c);
    });
  }
});

describe("tricky comparisons", () => {
  const beats = (a: string, b: string) => expect(v(a).value).toBeGreaterThan(v(b).value);
  const ties = (a: string, b: string) => expect(v(a).value).toBe(v(b).value);

  it("kicker wars", () => {
    beats("Ac Ad Kh 9s 7c 4d 2h", "As Ah Qh 9d 7d 4s 2c"); // AA-K beats AA-Q
    beats("Ac Kd Qh 9s 7c 4d 2h", "As Kh Qd 8s 7d 4c 2s"); // 9 kicker beats 8
    ties("Ac Ad Kh Qs Jc 4d 2h", "As Ah Kd Qd Jd 4s 2c"); // same top five → tie
  });

  it("two pair wars", () => {
    beats("Kc Kd 9h 9s Ac 4d 2h", "Kh Ks 9c 9d Qh 4s 2c"); // identical pairs, A vs Q kicker
    beats("Ac Ad 2h 2s 3c 4d 5h", "Kc Kd Qh Qs Ac 4d 2h"); // top pair rules: AA22 > KKQQ
    beats("Kc Kd Th Ts 2c 4d 6h", "Kh Ks 9c 9d Ah 4s 2s"); // higher second pair beats kicker
  });

  it("three pairs in seven cards: best two + best kicker", () => {
    // KK 99 55 A → plays KK 99 A
    const hand = v("Kc Kd 9h 9s 5c 5d Ah");
    expect(describeHand(hand)).toBe("Two pair — Kings and Nines");
    expect(hand.value).toBe(v("Kh Ks 9c 9d Ac 2d 3h").value);
  });

  it("flush vs straight flush vs straight", () => {
    beats("9h 8h 7h 6h 5h Ac Ad", "Ah Kh 9h 5h 2h Ac Kd"); // SF beats A-high flush
    beats("Ah Kh 9h 5h 2h Ac Kd", "Tc 9d 8h 7s 6c Ad Kh"); // flush beats straight
    beats("2h 3h 4h 5h 6h As Ks", "Ah 2c 3h 4h 5h Kc Qd"); // 6-high SF beats wheel SF
  });

  it("straight rank order; wheel is lowest", () => {
    beats("2c 3d 4h 5s 6c Kd Qh", "Ac 2d 3h 4s 5c Kd Qh"); // 6-high beats wheel
    beats("Ac Kd Qh Js Tc 4d 2h", "Kc Qd Jh Ts 9c 4d 2h"); // broadway beats K-high
  });

  it("full house wars; two trips make a full house", () => {
    const hand = v("Kc Kd Kh 9s 9c 9d Ah");
    expect(describeHand(hand)).toBe("Full house — Kings full of Nines");
    beats("2c 2d 2h Ks Kc 4d 5h", "Ac Ad Kh Ks Qc Jd 9h"); // any FH beats two pair
    beats("Kc Kd Kh 2s 2c 4d 5h", "Qc Qd Qh As Ac 4d 5h"); // trips rank first
    beats("Kc Kd Kh 9s 9c 4d 5h", "Kc Kd Kh 2s 2c 4d 5h"); // then the pair
  });

  it("quads kicker", () => {
    beats("9c 9d 9h 9s Ac 4d 2h", "9c 9d 9h 9s Kc 4d 2h");
  });

  it("board plays — both players chop", () => {
    const board = "Ac Kd Qh Js Tc";
    const p1 = v(`${board} 4d 2h`);
    const p2 = v(`${board} 9s 9c`);
    expect(p1.value).toBe(p2.value);
    expect(describeHand(p1)).toBe("Straight — Ace high");
  });

  it("flush decided by all five cards", () => {
    beats("Ah Kh 9h 5h 3h 2c 2d", "Ad Kd 9d 5d 2d 3c 3s");
  });

  it("six and seven card evaluation uses only the best five", () => {
    // 7th card can't drag a hand down
    ties("Ac Ad Kh Qs Jc 8d 2h", "Ah As Kd Qd Jd 3c 4c");
  });
});

describe("brute-force cross-check vs naive 5-card evaluator", () => {
  // Independent implementation: evaluate a 5-card hand the dumb way.
  function naive5(cards: CardInt[]): number[] {
    const ranks = cards.map(rankOf).sort((a, b) => b - a);
    const suits = cards.map(suitOf);
    const counts = new Map<number, number>();
    for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
    const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const isFlush = suits.every((s) => s === suits[0]);
    const uniq = [...new Set(ranks)];
    let straightHi = -1;
    if (uniq.length === 5) {
      if (uniq[0]! - uniq[4]! === 4) straightHi = uniq[0]!;
      else if (uniq.join(",") === "12,3,2,1,0") straightHi = 3; // wheel
    }
    if (isFlush && straightHi >= 0) return [8, straightHi];
    if (groups[0]![1] === 4) return [7, groups[0]![0], groups[1]![0]];
    if (groups[0]![1] === 3 && groups[1]![1] === 2) return [6, groups[0]![0], groups[1]![0]];
    if (isFlush) return [5, ...ranks];
    if (straightHi >= 0) return [4, straightHi];
    if (groups[0]![1] === 3) return [3, groups[0]![0], groups[1]![0], groups[2]![0]];
    if (groups[0]![1] === 2 && groups[1]![1] === 2)
      return [2, groups[0]![0], groups[1]![0], groups[2]![0]];
    if (groups[0]![1] === 2) return [1, groups[0]![0], groups[1]![0], groups[2]![0], groups[3]![0]];
    return [0, ...ranks];
  }

  const encodeNaive = (t: number[]): number =>
    (t[0]! << 20) |
    ((t[1] ?? 0) << 16) |
    ((t[2] ?? 0) << 12) |
    ((t[3] ?? 0) << 8) |
    ((t[4] ?? 0) << 4) |
    (t[5] ?? 0);

  function naiveBest7(cards: CardInt[]): number {
    let best = -1;
    for (let a = 0; a < 3; a++)
      for (let b = a + 1; b < 4; b++)
        for (let c = b + 1; c < 5; c++)
          for (let d = c + 1; d < 6; d++)
            for (let e = d + 1; e < 7; e++) {
              const val = encodeNaive(naive5([cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!]));
              if (val > best) best = val;
            }
    return best;
  }

  it("agrees with the naive evaluator on 3,000 random 7-card hands", () => {
    const rng = createSeededRng(20260612);
    for (let i = 0; i < 3000; i++) {
      const deck = shuffleInPlace(freshDeck(), rng);
      const seven = deck.slice(0, 7);
      const fast = evaluate(seven).value;
      const slow = naiveBest7(seven);
      if (fast !== slow) {
        throw new Error(
          `Mismatch on hand ${seven.join(",")}: fast=${fast.toString(16)} slow=${slow.toString(16)}`,
        );
      }
    }
  });

  it("bestFive re-evaluates to the same value on 1,000 random hands", () => {
    const rng = createSeededRng(99);
    for (let i = 0; i < 1000; i++) {
      const deck = shuffleInPlace(freshDeck(), rng);
      const seven = deck.slice(0, 7);
      const hand = evaluate(seven);
      expect(evaluate(hand.bestFive).value).toBe(hand.value);
    }
  });
});

describe("input validation", () => {
  it("rejects wrong card counts and duplicates", () => {
    expect(() => evaluate(cardsFromString("Ac Kd Qh Js"))).toThrow();
    expect(() => evaluate(cardsFromString("Ac Ac Kd Qh Js"))).toThrow();
    expect(() =>
      evaluate(cardsFromString("Ac Kd Qh Js Tc 9d 8h 7s")),
    ).toThrow();
  });
});
