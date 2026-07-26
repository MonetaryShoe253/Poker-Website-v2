import { useEffect, useState } from "react";
import { CountdownRing } from "../CountdownRing";

interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  durationMinutes: number;
  isBreak?: boolean;
}

function formatFrozenRemaining(timerStartedAt: string, timerPausedAt: string, durationMinutes: number): string {
  const deadline = new Date(timerStartedAt).getTime() + durationMinutes * 60_000;
  const remaining = Math.max(0, deadline - new Date(timerPausedAt).getTime());
  const totalSeconds = Math.ceil(remaining / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Elapsed/total fraction of the current level, ticking while running and
 * frozen at whatever it was when paused — the "how far through this level
 * are we" bar that a lone countdown ring doesn't make obvious at a glance. */
function BlindProgressBar({
  timerStartedAt,
  timerPausedAt,
  isPaused,
  durationMinutes,
  large,
}: {
  timerStartedAt: string;
  timerPausedAt: string | null;
  isPaused: boolean;
  durationMinutes: number;
  large: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [isPaused]);

  const startMs = new Date(timerStartedAt).getTime();
  const totalMs = durationMinutes * 60_000;
  const elapsedMs = isPaused && timerPausedAt ? new Date(timerPausedAt).getTime() - startMs : now - startMs;
  const fraction = Math.max(0, Math.min(1, totalMs > 0 ? elapsedMs / totalMs : 0));

  return (
    <div className={`w-full overflow-hidden rounded-full bg-line ${large ? "mt-6 h-2.5" : "mt-4 h-1.5"}`}>
      <div
        className="h-full rounded-full bg-ember transition-[width] duration-500"
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  );
}

export function BlindLevelDisplay({
  level,
  levelNumber,
  totalLevels,
  timerStartedAt,
  timerPausedAt,
  isPaused,
  size = "normal",
}: {
  level: BlindLevel | null;
  levelNumber: number;
  totalLevels: number;
  timerStartedAt: string | null;
  timerPausedAt: string | null;
  isPaused: boolean;
  size?: "normal" | "large";
}) {
  const large = size === "large";

  if (!level) {
    return <p className={large ? "text-2xl text-muted" : "text-muted"}>No blind schedule set yet.</p>;
  }

  const deadlineMs = timerStartedAt ? new Date(timerStartedAt).getTime() + level.durationMinutes * 60_000 : null;

  return (
    <div>
      <div
        className={
          large
            ? "flex flex-col items-center gap-8 lg:flex-row lg:justify-center lg:gap-16"
            : "flex flex-wrap items-center justify-between gap-4"
        }
      >
        <div className={large ? "text-center" : ""}>
          <div className="font-display text-xs uppercase tracking-widest text-muted">
            Level {levelNumber}
            {totalLevels ? ` of ${totalLevels}` : ""}
          </div>
          {level.isBreak ? (
            <div
              className={
                large
                  ? "tnum mt-2 font-display text-9xl text-purple-400"
                  : "tnum font-display text-3xl text-purple-400"
              }
            >
              BREAK
            </div>
          ) : (
            <>
              <div className={large ? "tnum mt-2 font-display text-9xl" : "tnum font-display text-3xl"}>
                {level.smallBlind}/{level.bigBlind}
              </div>
              {level.ante ? (
                <span
                  className={`mt-2 inline-flex items-baseline gap-1 rounded-full border border-purple-400/40 bg-purple-400/15 font-display uppercase tracking-widest text-purple-300 ${
                    large ? "px-4 py-1.5 text-lg" : "px-2.5 py-0.5 text-xs"
                  }`}
                >
                  BB Ante <span className="tnum">{level.ante}</span>
                </span>
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-col items-center gap-1">
          {timerStartedAt && !isPaused && deadlineMs && (
            <CountdownRing
              deadlineMs={deadlineMs}
              totalMs={level.durationMinutes * 60_000}
              size={large ? 280 : 72}
              formatMode="clock"
            />
          )}
          {isPaused && timerStartedAt && timerPausedAt && (
            <>
              <div className={large ? "tnum font-display text-6xl text-muted" : "tnum font-display text-2xl text-muted"}>
                {formatFrozenRemaining(timerStartedAt, timerPausedAt, level.durationMinutes)}
              </div>
              <div className="font-display text-xs uppercase tracking-widest text-ember">Paused</div>
            </>
          )}
          {!timerStartedAt && <p className="text-xs text-muted">Timer not started</p>}
        </div>
      </div>

      {timerStartedAt && (
        <BlindProgressBar
          timerStartedAt={timerStartedAt}
          timerPausedAt={timerPausedAt}
          isPaused={isPaused}
          durationMinutes={level.durationMinutes}
          large={large}
        />
      )}
    </div>
  );
}
