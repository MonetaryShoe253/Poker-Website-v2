import { TOURNAMENT_FLOOR_POINTS } from "@uos-poker/shared";
import { prisma } from "../db";

export interface TournamentFormula {
  A: number;
  B: number;
  ITM_PERCENT: number;
}

/** floor(A * N * e^(-B*p)) for finishers inside the cutoff, 0 outside it. */
export function calculateTournamentPoints(
  position: number,
  entrantCount: number,
  formula: TournamentFormula,
): number {
  const icmCutoff = Math.max(1, Math.floor(entrantCount * formula.ITM_PERCENT));
  if (position > icmCutoff) return 0;
  return Math.floor(formula.A * entrantCount * Math.exp(-formula.B * position));
}

/** Tops a non-DNF finish up to the guaranteed floor — never applies to a DNF. */
export function applyFloor(rawPoints: number): number {
  return Math.max(rawPoints, TOURNAMENT_FLOOR_POINTS);
}

/** 0 for a lone clean week; from the second week on, the bonus equals the
 * streak length itself (2, 3, 4, ...) — capped naturally by a ~12-week
 * semester, so it can never approach a real placement's points. */
export function streakBonusForWeeks(weeks: number): number {
  return weeks <= 1 ? 0 : weeks;
}

/** A DNF doesn't zero a streak outright once it's established — it costs 3
 * weeks of progress instead, so one bad week doesn't erase a semester of
 * consistency. Short streaks (<3) just break as normal. */
export function applyStreakMiss(currentWeeks: number): number {
  return currentWeeks >= 3 ? Math.max(0, currentWeeks - 3) : 0;
}

export async function getTournamentFormula(): Promise<TournamentFormula> {
  const rows = await prisma.formulaConfig.findMany({ where: { key: { in: ["A", "B", "ITM_PERCENT"] } } });
  const map = new Map(rows.map((row) => [row.key, Number(row.value)]));
  return {
    A: map.get("A") ?? 2.5,
    B: map.get("B") ?? 0.22,
    ITM_PERCENT: map.get("ITM_PERCENT") ?? 0.2,
  };
}

const FORMULA_DEFAULTS = [
  { key: "A", value: "2.5" },
  { key: "B", value: "0.22" },
  { key: "ITM_PERCENT", value: "0.2" },
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
