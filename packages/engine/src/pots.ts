/**
 * Side-pot layering. Pots are computed from each player's *total* committed
 * chips for the hand (folded players' chips stay in as dead money), layered
 * at each distinct commitment level, then adjacent pots with identical
 * eligible sets are merged. Uncalled excess is refunded by the hand state
 * machine *before* pots are computed, so the top layer is always contested.
 */

export interface PotInput {
  seat: number;
  committed: number;
  folded: boolean;
}

export interface Pot {
  amount: number;
  /** Seats that can win this pot (non-folded, committed to this layer). */
  eligible: number[];
}

const sameMembers = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

export function computePots(inputs: PotInput[]): Pot[] {
  const levels = [...new Set(inputs.filter((i) => i.committed > 0).map((i) => i.committed))].sort(
    (a, b) => a - b,
  );

  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const i of inputs) {
      amount += Math.max(0, Math.min(i.committed, level) - prev);
    }
    const eligible = inputs.filter((i) => !i.folded && i.committed >= level).map((i) => i.seat);
    if (amount > 0) {
      if (eligible.length === 0) {
        throw new Error(`computePots: pot layer at ${level} has no eligible players`);
      }
      const last = pots[pots.length - 1];
      if (last && sameMembers(last.eligible, eligible)) {
        last.amount += amount;
      } else {
        pots.push({ amount, eligible });
      }
    }
    prev = level;
  }
  return pots;
}
