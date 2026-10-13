import type { TournamentBlindLevel } from "./constants";

export interface BlindClockState {
  currentBlindLevel: number;
  /** Epoch ms the current level started (shifted forward on resume). */
  timerStartedAt: number | null;
  /** Epoch ms the clock was paused, when paused. */
  timerPausedAt: number | null;
  isPaused: boolean;
}

/**
 * Rolls the blind clock forward through every level whose time has fully
 * elapsed, so the schedule progresses on its own at 0:00 rather than waiting
 * for a director to press "Next level". Each rollover starts the next level
 * exactly where the last one ended (start += duration), so a late read never
 * drifts the schedule. While paused, time is measured to the pause instant —
 * a paused clock never advances. The final level never rolls over; it just
 * sits at 0:00. Pure: server and clients share it, so they always agree.
 */
export function resolveBlindClock(
  schedule: ReadonlyArray<Pick<TournamentBlindLevel, "durationMinutes">> | null | undefined,
  state: BlindClockState,
  now: number,
): BlindClockState & { advanced: boolean } {
  let { currentBlindLevel, timerStartedAt } = state;
  if (!schedule || schedule.length === 0 || timerStartedAt === null) {
    return { ...state, advanced: false };
  }
  const reference = state.isPaused && state.timerPausedAt !== null ? state.timerPausedAt : now;
  let advanced = false;
  while (currentBlindLevel < schedule.length - 1) {
    const level = schedule[currentBlindLevel];
    if (!level) break;
    const durationMs = level.durationMinutes * 60_000;
    if (durationMs <= 0 || reference - timerStartedAt < durationMs) break;
    timerStartedAt += durationMs;
    currentBlindLevel += 1;
    advanced = true;
  }
  return { ...state, currentBlindLevel, timerStartedAt, advanced };
}
