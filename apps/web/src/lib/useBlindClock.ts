import { useEffect, useState } from "react";
import { resolveBlindClock, type TournamentBlindLevel } from "@uos-poker/shared";

interface BlindClockSource {
  blindSchedule: ReadonlyArray<Pick<TournamentBlindLevel, "durationMinutes">> | null;
  currentBlindLevel: number;
  timerStartedAt: string | null;
  timerPausedAt: string | null;
  isPaused: boolean;
}

/** The blind clock as of right now: rolls onto the next level the moment the
 * timer hits 0:00, using the same rule the server persists, so the display
 * flips immediately instead of waiting for the next poll. */
export function useBlindClock<T extends BlindClockSource>(source: T | null): T | null {
  const [now, setNow] = useState(() => Date.now());
  const running = Boolean(source?.timerStartedAt) && !source?.isPaused;
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [running]);

  if (!source) return null;
  const resolved = resolveBlindClock(
    source.blindSchedule,
    {
      currentBlindLevel: source.currentBlindLevel,
      timerStartedAt: source.timerStartedAt ? new Date(source.timerStartedAt).getTime() : null,
      timerPausedAt: source.timerPausedAt ? new Date(source.timerPausedAt).getTime() : null,
      isPaused: source.isPaused,
    },
    Math.max(now, Date.now()),
  );
  if (!resolved.advanced || resolved.timerStartedAt === null) return source;
  return {
    ...source,
    currentBlindLevel: resolved.currentBlindLevel,
    timerStartedAt: new Date(resolved.timerStartedAt).toISOString(),
  };
}
