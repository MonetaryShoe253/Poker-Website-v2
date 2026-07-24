import { prisma } from "../db";

export interface TournamentFormula {
  A: number;
  B: number;
  ITM_PERCENT: number;
  ITM_FLOOR: number;
  SIGNOUT_FLOOR: number;
  STREAK_BASE: number;
}

export function calculateTournamentPoints(
  position: number,
  entrantCount: number,
  formula: TournamentFormula,
): number {
  const scaled = formula.A * Math.pow(position, -formula.B);
  const expected = scaled * entrantCount;
  const itmThreshold = Math.max(1, Math.floor(entrantCount * formula.ITM_PERCENT));
  const itmFloor = Math.max(formula.SIGNOUT_FLOOR, formula.ITM_FLOOR);

  if (position <= itmThreshold) {
    return Math.max(expected, itmFloor);
  }

  if (position > itmThreshold) {
    return Math.max(expected, formula.SIGNOUT_FLOOR);
  }

  return formula.SIGNOUT_FLOOR;
}

export function deriveStreaks(
  entries: Array<{ userId: string; signedOut: boolean; dnf: boolean; sessionDate: string }>,
  baseBonus: number,
): Array<{ userId: string; currentStreak: number; longestStreak: number; streakBonus: number }> {
  const byUser = new Map<string, Array<{ signedOut: boolean; dnf: boolean; sessionDate: string }>>();
  for (const entry of entries) {
    const existing = byUser.get(entry.userId) ?? [];
    existing.push({ signedOut: entry.signedOut, dnf: entry.dnf, sessionDate: entry.sessionDate });
    byUser.set(entry.userId, existing);
  }

  return [...byUser.entries()].map(([userId, sessions]) => {
    let currentStreak = 0;
    let longestStreak = 0;
    for (const session of sessions) {
      if (session.signedOut && !session.dnf) {
        currentStreak += 1;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
    return {
      userId,
      currentStreak,
      longestStreak,
      streakBonus: longestStreak > 0 ? baseBonus * longestStreak : 0,
    };
  });
}

export async function getTournamentFormula(): Promise<TournamentFormula> {
  const rows = await prisma.formulaConfig.findMany({ where: { key: { in: ["A", "B", "ITM_PERCENT", "ITM_FLOOR", "SIGNOUT_FLOOR", "STREAK_BASE"] } } });
  const map = new Map(rows.map((row) => [row.key, Number(row.value)]));
  return {
    A: map.get("A") ?? 2.5,
    B: map.get("B") ?? 0.22,
    ITM_PERCENT: map.get("ITM_PERCENT") ?? 0.2,
    ITM_FLOOR: map.get("ITM_FLOOR") ?? 6,
    SIGNOUT_FLOOR: map.get("SIGNOUT_FLOOR") ?? 3,
    STREAK_BASE: map.get("STREAK_BASE") ?? 2,
  };
}

const FORMULA_DEFAULTS = [
  { key: "A", value: "2.5" },
  { key: "B", value: "0.22" },
  { key: "ITM_PERCENT", value: "0.2" },
  { key: "ITM_FLOOR", value: "6" },
  { key: "SIGNOUT_FLOOR", value: "3" },
  { key: "STREAK_BASE", value: "2" },
];

/** Seeds default formula values for keys that don't exist yet. Never
 * overwrites an existing row, so an admin's saved formula survives
 * restarts and repeat calls. */
export async function ensureFormulaConfigSeed(): Promise<void> {
  await prisma.formulaConfig.createMany({
    data: FORMULA_DEFAULTS,
    skipDuplicates: true,
  });
}
