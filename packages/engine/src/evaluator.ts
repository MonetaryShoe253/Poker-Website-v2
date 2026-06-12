import type { HandCategory } from "@uos-poker/shared";
import { rankOf, suitOf, type CardInt } from "./cards";

/**
 * Hand evaluation: best 5 of up to 7 cards, full ranking with kickers.
 *
 * `value` is a single integer that totally orders hands:
 *   category(4 bits) << 20 | t1 << 16 | t2 << 12 | t3 << 8 | t4 << 4 | t5
 * where t1..t5 are tiebreak ranks (0 = deuce … 12 = ace) in significance
 * order. Equal values are exact ties (chopped pots).
 */
export interface HandValue {
  value: number;
  category: HandCategory;
  /** The five cards that form the hand — for showdown display. */
  bestFive: CardInt[];
}

const CAT = {
  HIGH: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
} as const;

const encode = (cat: number, t: number[]): number =>
  (cat << 20) |
  ((t[0] ?? 0) << 16) |
  ((t[1] ?? 0) << 12) |
  ((t[2] ?? 0) << 8) |
  ((t[3] ?? 0) << 4) |
  (t[4] ?? 0);

/**
 * Highest straight in a rank bitmask, or -1. Returns the high rank of the
 * straight (wheel A-2-3-4-5 returns 3, the five).
 */
function straightHigh(rankMask: number): number {
  for (let hi = 12; hi >= 4; hi--) {
    const run = 0b11111 << (hi - 4);
    if ((rankMask & run) === run) return hi;
  }
  // Wheel: A,2,3,4,5 = bits 12,0,1,2,3
  const wheel = (1 << 12) | 0b1111;
  if ((rankMask & wheel) === wheel) return 3;
  return -1;
}

/** Cards of `ranks` (one per rank, in order) drawn from a desc-sorted pool. */
function cardsForRanks(sorted: CardInt[], ranks: number[]): CardInt[] {
  const out: CardInt[] = [];
  for (const r of ranks) {
    const card = sorted.find((c) => rankOf(c) === r && !out.includes(c));
    if (card === undefined) throw new Error(`cardsForRanks: rank ${r} missing`);
    out.push(card);
  }
  return out;
}

/** Evaluate 5–7 cards; throws on anything else or on duplicates. */
export function evaluate(cards: readonly CardInt[]): HandValue {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`evaluate: need 5-7 cards, got ${cards.length}`);
  }
  if (new Set(cards).size !== cards.length) {
    throw new Error("evaluate: duplicate cards");
  }

  const sorted = [...cards].sort((a, b) => rankOf(b) - rankOf(a));
  const rankCounts = new Array<number>(13).fill(0);
  const suitCounts = new Array<number>(4).fill(0);
  let rankMask = 0;
  for (const c of cards) {
    rankCounts[rankOf(c)]!++;
    suitCounts[suitOf(c)]!++;
    rankMask |= 1 << rankOf(c);
  }

  // --- Flush / straight flush ---------------------------------------------
  const flushSuit = suitCounts.findIndex((n) => n >= 5);
  if (flushSuit !== -1) {
    const flushCards = sorted.filter((c) => suitOf(c) === flushSuit);
    let flushMask = 0;
    for (const c of flushCards) flushMask |= 1 << rankOf(c);

    const sfHigh = straightHigh(flushMask);
    if (sfHigh !== -1) {
      const runRanks =
        sfHigh === 3 ? [3, 2, 1, 0, 12] : [sfHigh, sfHigh - 1, sfHigh - 2, sfHigh - 3, sfHigh - 4];
      return {
        value: encode(CAT.STRAIGHT_FLUSH, [sfHigh]),
        category: CAT.STRAIGHT_FLUSH,
        bestFive: cardsForRanks(flushCards, runRanks),
      };
    }
    // A 7-card hand with a flush cannot also contain quads or a full house
    // (those need ≥3 cards sharing a rank pattern that caps distinct ranks
    // below the 5 a flush requires), so flush is decided here.
    const top5 = flushCards.slice(0, 5);
    return {
      value: encode(CAT.FLUSH, top5.map(rankOf)),
      category: CAT.FLUSH,
      bestFive: top5,
    };
  }

  // --- Rank-count patterns --------------------------------------------------
  const quadRank = rankCounts.findIndex((n) => n === 4);
  const tripRanks: number[] = [];
  const pairRanks: number[] = [];
  for (let r = 12; r >= 0; r--) {
    if (rankCounts[r] === 3) tripRanks.push(r);
    else if (rankCounts[r] === 2) pairRanks.push(r);
  }

  if (quadRank !== -1) {
    const kicker = sorted.find((c) => rankOf(c) !== quadRank)!;
    return {
      value: encode(CAT.QUADS, [quadRank, rankOf(kicker)]),
      category: CAT.QUADS,
      bestFive: [...sorted.filter((c) => rankOf(c) === quadRank), kicker],
    };
  }

  if (tripRanks.length >= 1 && (tripRanks.length >= 2 || pairRanks.length >= 1)) {
    const trips = tripRanks[0]!;
    const pair = tripRanks.length >= 2 ? tripRanks[1]! : pairRanks[0]!;
    return {
      value: encode(CAT.FULL_HOUSE, [trips, pair]),
      category: CAT.FULL_HOUSE,
      bestFive: [
        ...sorted.filter((c) => rankOf(c) === trips),
        ...sorted.filter((c) => rankOf(c) === pair).slice(0, 2),
      ],
    };
  }

  const stHigh = straightHigh(rankMask);
  if (stHigh !== -1) {
    const runRanks =
      stHigh === 3 ? [3, 2, 1, 0, 12] : [stHigh, stHigh - 1, stHigh - 2, stHigh - 3, stHigh - 4];
    return {
      value: encode(CAT.STRAIGHT, [stHigh]),
      category: CAT.STRAIGHT,
      bestFive: cardsForRanks(sorted, runRanks),
    };
  }

  if (tripRanks.length === 1) {
    const trips = tripRanks[0]!;
    const kickers = sorted.filter((c) => rankOf(c) !== trips).slice(0, 2);
    return {
      value: encode(CAT.TRIPS, [trips, ...kickers.map(rankOf)]),
      category: CAT.TRIPS,
      bestFive: [...sorted.filter((c) => rankOf(c) === trips), ...kickers],
    };
  }

  if (pairRanks.length >= 2) {
    const [hi, lo] = [pairRanks[0]!, pairRanks[1]!];
    const kicker = sorted.find((c) => rankOf(c) !== hi && rankOf(c) !== lo)!;
    return {
      value: encode(CAT.TWO_PAIR, [hi, lo, rankOf(kicker)]),
      category: CAT.TWO_PAIR,
      bestFive: [
        ...sorted.filter((c) => rankOf(c) === hi),
        ...sorted.filter((c) => rankOf(c) === lo),
        kicker,
      ],
    };
  }

  if (pairRanks.length === 1) {
    const pair = pairRanks[0]!;
    const kickers = sorted.filter((c) => rankOf(c) !== pair).slice(0, 3);
    return {
      value: encode(CAT.PAIR, [pair, ...kickers.map(rankOf)]),
      category: CAT.PAIR,
      bestFive: [...sorted.filter((c) => rankOf(c) === pair), ...kickers],
    };
  }

  const top5 = sorted.slice(0, 5);
  return {
    value: encode(CAT.HIGH, top5.map(rankOf)),
    category: CAT.HIGH,
    bestFive: top5,
  };
}

// ---------------------------------------------------------------------------
// Plain-English hand names — every showdown must be legible to a beginner.
// ---------------------------------------------------------------------------

const RANK_NAMES = [
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Jack",
  "Queen",
  "King",
  "Ace",
] as const;

const plural = (rank: number): string => {
  const name = RANK_NAMES[rank]!;
  return name === "Six" ? "Sixes" : `${name}s`;
};

export function describeHand(hand: HandValue): string {
  const t1 = (hand.value >> 16) & 0xf;
  const t2 = (hand.value >> 12) & 0xf;
  switch (hand.category) {
    case 8:
      return t1 === 12 ? "Royal flush" : `Straight flush — ${RANK_NAMES[t1]} high`;
    case 7:
      return `Four of a kind — ${plural(t1)}`;
    case 6:
      return `Full house — ${plural(t1)} full of ${plural(t2)}`;
    case 5:
      return `Flush — ${RANK_NAMES[t1]} high`;
    case 4:
      return `Straight — ${RANK_NAMES[t1]} high`;
    case 3:
      return `Three of a kind — ${plural(t1)}`;
    case 2:
      return `Two pair — ${plural(t1)} and ${plural(t2)}`;
    case 1:
      return `Pair of ${plural(t1)}`;
    case 0:
      return `High card — ${RANK_NAMES[t1]}`;
  }
}
