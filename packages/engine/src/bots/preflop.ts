import { freshDeck, makeCard, rankOf, suitOf, type CardInt } from "../cards";
import { evaluate } from "../evaluator";
import { createSeededRng } from "../rng";

/**
 * Preflop hand strength as a percentile over all 1,326 starting combos.
 * Computed once per process: each of the 169 canonical hands is rolled out
 * vs one random opponent with a fixed seed (deterministic, reproducible),
 * then ranked weighted by combo count. ~0.3s lazily on first use.
 */

const ROLLOUTS = 250;

function canonicalKey(a: CardInt, b: CardInt): string {
  const hi = Math.max(rankOf(a), rankOf(b));
  const lo = Math.min(rankOf(a), rankOf(b));
  if (hi === lo) return `${hi}-${lo}-p`;
  return `${hi}-${lo}-${suitOf(a) === suitOf(b) ? "s" : "o"}`;
}

let percentileTable: Map<string, number> | null = null;

function buildTable(): Map<string, number> {
  const rng = createSeededRng(0x5eed_cafe);
  const entries: Array<{ key: string; equity: number; weight: number }> = [];

  for (let hi = 0; hi < 13; hi++) {
    for (let lo = 0; lo <= hi; lo++) {
      const variants: Array<{ key: string; cards: [CardInt, CardInt]; weight: number }> =
        hi === lo
          ? [{ key: `${hi}-${lo}-p`, cards: [makeCard(hi, 0), makeCard(hi, 1)], weight: 6 }]
          : [
              { key: `${hi}-${lo}-s`, cards: [makeCard(hi, 0), makeCard(lo, 0)], weight: 4 },
              { key: `${hi}-${lo}-o`, cards: [makeCard(hi, 0), makeCard(lo, 1)], weight: 12 },
            ];

      for (const variant of variants) {
        const remaining = freshDeck().filter((c) => !variant.cards.includes(c));
        let score = 0;
        for (let r = 0; r < ROLLOUTS; r++) {
          // Draw 7 cards: 2 for the opponent, 5 for the board.
          const pool = [...remaining];
          for (let i = 0; i < 7; i++) {
            const j = i + rng.nextInt(pool.length - i);
            const tmp = pool[i]!;
            pool[i] = pool[j]!;
            pool[j] = tmp;
          }
          const opp = [pool[0]!, pool[1]!];
          const board = pool.slice(2, 7);
          const mine = evaluate([...variant.cards, ...board]).value;
          const theirs = evaluate([...opp, ...board]).value;
          score += mine > theirs ? 1 : mine === theirs ? 0.5 : 0;
        }
        entries.push({ key: variant.key, equity: score / ROLLOUTS, weight: variant.weight });
      }
    }
  }

  entries.sort((a, b) => a.equity - b.equity);
  const total = entries.reduce((sum, e) => sum + e.weight, 0); // 1326
  const table = new Map<string, number>();
  let below = 0;
  for (const e of entries) {
    table.set(e.key, (below + e.weight / 2) / total);
    below += e.weight;
  }
  return table;
}

/** Percentile (0 = worst trash, ~1 = aces) of a starting hand. */
export function preflopPercentile(hole: readonly CardInt[]): number {
  if (hole.length !== 2) throw new Error("preflopPercentile: need exactly 2 cards");
  percentileTable ??= buildTable();
  const pct = percentileTable.get(canonicalKey(hole[0]!, hole[1]!));
  if (pct === undefined) throw new Error("preflopPercentile: unknown hand");
  return pct;
}
