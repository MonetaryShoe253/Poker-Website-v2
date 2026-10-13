import { useCallback, useEffect, useRef, useState } from "react";
import { api, btn } from "../../lib/adminShared";
import { useBlindClock } from "../../lib/useBlindClock";
import { useFullscreen } from "../../lib/useFullscreen";
import { BlindLevelDisplay } from "./BlindLevelDisplay";

interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  durationMinutes: number;
}

interface PointsStructureRow {
  position: number;
  points: number;
}

interface TournamentInfo {
  status: string | null;
  activePlayerCount: number | null;
  blindSchedule: BlindLevel[] | null;
  currentBlindLevel: number;
  timerStartedAt: string | null;
  timerPausedAt: string | null;
  isPaused: boolean;
  entrantCount: number | null;
  pointsStructure: PointsStructureRow[] | null;
}

interface EntryRow {
  id: string;
  nickname: string;
  signedIn: boolean;
  signedOut: boolean;
  finishingPosition: number | null;
  points: number | null;
  dnf: boolean;
}

const POLL_MS = 7_000;

export function TournamentInfoView({ sessionId }: { sessionId: string }) {
  const [rawInfo, setInfo] = useState<TournamentInfo | null>(null);
  // Live view of the blind clock: rolls to the next level at 0:00 between polls.
  const info = useBlindClock(rawInfo);
  const [entries, setEntries] = useState<EntryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggle } = useFullscreen(containerRef);

  const loadInfo = useCallback(() => {
    void fetch(`/api/sessions/${sessionId}/tournament-info`)
      .then((r) => r.json() as Promise<TournamentInfo>)
      .then(setInfo);
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      void fetch(`/api/sessions/${sessionId}/tournament-info`)
        .then((r) => r.json() as Promise<TournamentInfo>)
        .then((data) => {
          if (!cancelled) setInfo(data);
        });
      void fetch(`/api/sessions/${sessionId}/entries`)
        .then((r) => r.json() as Promise<EntryRow[]>)
        .then((data) => {
          if (!cancelled) setEntries(data);
        });
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId]);

  if (!info) return <p className="text-muted">Loading…</p>;

  const level = info.blindSchedule?.[info.currentBlindLevel] ?? null;
  const totalLevels = info.blindSchedule?.length ?? 0;
  const timerRunning = Boolean(info.timerStartedAt);
  const canGoPrevious = info.currentBlindLevel > 0;
  const canGoNext = info.currentBlindLevel < totalLevels - 1;

  const run = (path: string, body?: unknown) => {
    void api(path, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) })
      .then(() => {
        setError(null);
        loadInfo();
      })
      .catch((e: Error) => setError(e.message));
  };

  const previousLevel = () =>
    run(`/api/admin/sessions/${sessionId}/timer/advance`, { level: info.currentBlindLevel - 1 });
  const nextLevel = () =>
    run(`/api/admin/sessions/${sessionId}/timer/advance`, { level: info.currentBlindLevel + 1 });
  const nudge = (seconds: number) => run(`/api/admin/sessions/${sessionId}/timer/nudge`, { seconds });
  const pauseOrResume = () =>
    run(`/api/admin/sessions/${sessionId}/timer/${info.isPaused ? "resume" : "pause"}`);
  // Most recent bust first: the latest player out holds the best (lowest)
  // finishing position among those already out. DNFs carry a sentinel
  // position, so they sort to the end on their own.
  const knockedOut = [...(entries ?? [])]
    .filter((e) => e.signedOut)
    .sort((a, b) => (a.finishingPosition ?? 999_999) - (b.finishingPosition ?? 999_999));
  const entrants = (entries ?? []).filter((e) => e.signedIn).length;
  const playersLeft = info.activePlayerCount ?? (entries ?? []).filter((e) => e.signedIn && !e.signedOut).length;
  const hasPoints = Boolean(info.pointsStructure && info.pointsStructure.length > 0);
  const controlBtn = `${btn} ${isFullscreen ? "px-5 py-3 text-base" : ""}`;

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? "flex h-screen flex-col gap-4 overflow-hidden bg-bg-0 p-6 text-text"
          : "flex flex-col gap-3"
      }
    >
      <div className={isFullscreen ? "panel-steel shrink-0 rounded-lg p-6 ring-1 ring-ember/25" : "panel-steel rounded-lg p-6 ring-1 ring-ember/25"}>
        <div className="flex items-center justify-between">
          <div className="font-display text-xs uppercase tracking-widest text-muted">Blind level</div>
          <button
            onClick={toggle}
            className="rounded border border-steel px-2.5 py-1 text-xs hover:border-ember hover:text-ember"
          >
            {isFullscreen ? "Exit fullscreen" : "Expand"}
          </button>
        </div>
        <div className="mt-4">
          <BlindLevelDisplay
            level={level}
            levelNumber={info.currentBlindLevel + 1}
            totalLevels={info.blindSchedule?.length ?? 0}
            timerStartedAt={info.timerStartedAt}
            timerPausedAt={info.timerPausedAt}
            isPaused={info.isPaused}
            size={isFullscreen ? "large" : "normal"}
          />
        </div>

        {totalLevels > 0 && (
          <div className={isFullscreen ? "mt-4 flex flex-wrap justify-center gap-3" : "mt-4 flex flex-wrap justify-center gap-2"}>
            <button disabled={!timerRunning} onClick={pauseOrResume} className={controlBtn}>
              {info.isPaused ? "▶ Resume" : "⏸ Pause"}
            </button>
            <button disabled={!canGoPrevious} onClick={previousLevel} className={controlBtn}>
              ◀ Previous level
            </button>
            <button disabled={!timerRunning} onClick={() => nudge(-30)} className={controlBtn}>
              ⏪ −30s
            </button>
            <button disabled={!timerRunning} onClick={() => nudge(30)} className={controlBtn}>
              +30s ⏩
            </button>
            <button disabled={!canGoNext} onClick={nextLevel} className={controlBtn}>
              Next level ▶
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-center text-xs text-ember">{error}</p>}
      </div>

      <div
        className={`grid gap-3 ${isFullscreen ? "min-h-0 flex-1" : ""} ${
          hasPoints
            ? isFullscreen
              ? "lg:grid-cols-[11rem_minmax(0,1fr)_minmax(0,22rem)]"
              : "lg:grid-cols-[9rem_minmax(0,1fr)_minmax(0,18rem)]"
            : isFullscreen
              ? "lg:grid-cols-[11rem_minmax(0,1fr)]"
              : "lg:grid-cols-[9rem_minmax(0,1fr)]"
        }`}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:grid-rows-2">
          <Stat label="Players left" value={playersLeft} large={isFullscreen} />
          <Stat label="Entrants" value={entrants} large={isFullscreen} />
        </div>

        <div className={`panel-steel flex min-h-0 flex-col rounded-lg ${isFullscreen ? "p-4" : "h-56 p-3"}`}>
          <div className="font-display text-[10px] uppercase tracking-widest text-muted">
            Knocked out{knockedOut.length > 0 ? ` · ${knockedOut.length}` : ""}
          </div>
          {knockedOut.length === 0 ? (
            <p className="mt-2 text-xs text-muted">Nobody's out yet.</p>
          ) : (
            // Fills columns top-to-bottom, newest first; anything past the
            // panel's edge is clipped, so the list can never push the
            // display off the screen however many players are out.
            <ol
              className={`mt-2 min-h-0 flex-1 overflow-hidden ${isFullscreen ? "text-sm" : "text-xs"}`}
              style={{ columnWidth: isFullscreen ? "15rem" : "12rem", columnGap: "1.5rem", columnFill: "auto" }}
            >
              {knockedOut.map((e) => (
                <li key={e.id} className="flex break-inside-avoid justify-between gap-2 border-b border-line/40 py-0.5">
                  <span className="truncate">{e.nickname}</span>
                  <span className="tnum shrink-0 text-muted">{e.dnf ? "DNF" : `#${e.finishingPosition}`}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {hasPoints && info.pointsStructure && (
          <div className={`panel-steel min-h-0 overflow-hidden rounded-lg ${isFullscreen ? "p-4" : "p-3"}`}>
            <div className="font-display text-[10px] uppercase tracking-widest text-muted">
              Points structure · {info.entrantCount} {info.entrantCount === 1 ? "entrant" : "entrants"}
            </div>
            <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-1.5">
              {info.pointsStructure.map((row) => (
                <div key={row.position} className="rounded border border-steel px-1.5 py-1 text-center">
                  <div className="tnum font-display text-[10px] text-muted">#{row.position}</div>
                  <div className={isFullscreen ? "tnum font-display text-sm" : "tnum font-display text-xs"}>
                    {row.points} pts
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, large }: { label: string; value: number; large: boolean }) {
  return (
    <div className={`panel-steel flex flex-col justify-center rounded-lg text-center ${large ? "p-4" : "p-3"}`}>
      <div className="font-display text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`tnum font-display ${large ? "mt-1 text-5xl" : "mt-0.5 text-3xl"}`}>{value}</div>
    </div>
  );
}
