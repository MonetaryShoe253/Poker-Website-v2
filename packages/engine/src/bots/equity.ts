import { freshDeck, rankOf, suitOf, type CardInt } from "../cards";
import { evaluate } from "../evaluator";
import type { Rng } from "../rng";

/**
 * Monte Carlo equity: P(win) + P(tie)/ties vs N opponents holding random
 * cards, rolling unknown board cards out. 200–500 rollouts in production,
 * fewer in tests — decisions stay comfortably under 50ms.
 */
export function monteCarloEquity(opts: {
  hole: readonly CardInt[];
  board: readonly CardInt[];
  opponents: number;
  rollouts: number;
  rng: Rng;
}): number {
  const { hole, board, opponents, rollouts, rng } = opts;
  if (opponents < 1) return 1;
  const known = new Set([...hole, ...board]);
  const remaining = freshDeck().filter((c) => !known.has(c));
  const boardNeeded = 5 - board.length;
  const draw = opponents * 2 + boardNeeded;

  let score = 0;
  for (let r = 0; r < rollouts; r++) {
    const pool = [...remaining];
    for (let i = 0; i < draw; i++) {
      const j = i + rng.nextInt(pool.length - i);
      const tmp = pool[i]!;
      pool[i] = pool[j]!;
      pool[j] = tmp;
    }
    const fullBoard = [...board, ...pool.slice(opponents * 2, opponents * 2 + boardNeeded)];
    const mine = evaluate([...hole, ...fullBoard]).value;
    let beaten = false;
    let ties = 0;
    for (let o = 0; o < opponents; o++) {
      const theirs = evaluate([pool[o * 2]!, pool[o * 2 + 1]!, ...fullBoard]).value;
      if (theirs > mine) {
        beaten = true;
        break;
      }
      if (theirs === mine) ties++;
    }
    if (!beaten) score += ties === 0 ? 1 : 1 / (ties + 1);
  }
  return score / rollouts;
}

export interface DrawInfo {
  flushDraw: boolean;
  openEnded: boolean;
  gutshot: boolean;
  /** Made pair or better right now (any pair, incl. board pairs). */
  pairOrBetter: boolean;
  /** Strong draw worth semi-bluffing: flush draw or open-ended. */
  strongDraw: boolean;
}

/** Cheap draw flags for postflop policies (board of 3 or 4 cards). */
export function detectDraws(hole: readonly CardInt[], board: readonly CardInt[]): DrawInfo {
  const all = [...hole, ...board];
  const suitCounts = [0, 0, 0, 0];
  const holeSuits = new Set(hole.map(suitOf));
  for (const c of all) suitCounts[suitOf(c)]!++;
  const flushDraw =
    board.length < 5 &&
    suitCounts.some((n, suit) => n === 4 && holeSuits.has(suit));

  let rankMask = 0;
  for (const c of all) rankMask |= 1 << rankOf(c);
  // Ace counts low for wheel draws.
  const extMask = (rankMask << 1) | ((rankMask >> 12) & 1);

  let openEnded = false;
  let gutshot = false;
  if (board.length < 5) {
    // Open-ended: 4 consecutive ranks with a live card above AND below.
    for (let lowBit = 1; lowBit + 4 <= 13; lowBit++) {
      const run = 0b1111 << lowBit;
      if ((extMask & run) === run) openEnded = true;
    }
    // Any 5-window with exactly 4 ranks present is a straight draw; if the
    // hand isn't open-ended it's a gutshot (incl. AKQJ and A234 edge draws).
    let anyFourWindow = false;
    for (let lowBit = 0; lowBit + 4 <= 13; lowBit++) {
      const window = 0b11111 << lowBit;
      if (countBits(extMask & window) === 4) anyFourWindow = true;
    }
    gutshot = anyFourWindow && !openEnded;
  }

  const pairOrBetter = board.length >= 3 && evaluate(all).category >= 1;
  return {
    flushDraw,
    openEnded,
    gutshot,
    pairOrBetter,
    strongDraw: flushDraw || openEnded,
  };
}

function countBits(n: number): number {
  let count = 0;
  while (n) {
    n &= n - 1;
    count++;
  }
  return count;
}
