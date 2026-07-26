import { useEffect, useRef, useState } from "react";
import { useFullscreen } from "../../lib/useFullscreen";
import { BlindLevelDisplay } from "./BlindLevelDisplay";

interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  durationMinutes: number;
}

interface TournamentInfo {
  status: string | null;
  activePlayerCount: number | null;
  blindSchedule: BlindLevel[] | null;
  currentBlindLevel: number;
  timerStartedAt: string | null;
  timerPausedAt: string | null;
  isPaused: boolean;
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
  const [info, setInfo] = useState<TournamentInfo | null>(null);
  const [entries, setEntries] = useState<EntryRow[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggle } = useFullscreen(containerRef);

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
  const signedOutRanked = [...(entries ?? [])]
    .filter((e) => e.signedOut)
    .sort((a, b) => (a.finishingPosition ?? 999_999) - (b.finishingPosition ?? 999_999));
  const stillPlaying = (entries ?? []).filter((e) => e.signedIn && !e.signedOut);

  return (
    <div
      ref={containerRef}
      className={isFullscreen ? "flex min-h-screen flex-col justify-center bg-bg-0 p-8 text-text" : ""}
    >
      <div className={isFullscreen ? "panel-steel rounded-lg p-10 ring-1 ring-ember/25" : "panel-steel rounded-lg p-4 ring-1 ring-ember/25"}>
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
        <div className={isFullscreen ? "mt-8 text-center" : "mt-4"}>
          <div className="font-display text-xs uppercase tracking-widest text-muted">Active players</div>
          <div className={isFullscreen ? "tnum font-display text-4xl" : "tnum font-display text-xl"}>
            {info.activePlayerCount ?? "—"}
          </div>
        </div>
      </div>

      <div className={isFullscreen ? "mt-6 grid gap-3 lg:grid-cols-2" : "mt-4 grid gap-4 lg:grid-cols-2"}>
        <div className="panel-steel rounded-lg p-4">
          <div className="font-display text-xs uppercase tracking-widest text-muted">Sign-out leaderboard</div>
          <ul className={`mt-2 space-y-1 ${isFullscreen ? "text-xs" : "text-sm"}`}>
            {signedOutRanked.map((e) => (
              <li key={e.id} className="flex justify-between border-b border-line/40 py-1">
                <span>{e.nickname}</span>
                <span className="tnum text-muted">{e.dnf ? "DNF" : `#${e.finishingPosition}`}</span>
              </li>
            ))}
            {signedOutRanked.length === 0 && <li className="text-muted">Nobody's signed out yet.</li>}
          </ul>
        </div>

        <div className="panel-steel rounded-lg p-4">
          <div className="font-display text-xs uppercase tracking-widest text-muted">Still playing</div>
          <div className={`mt-2 flex flex-wrap gap-2 ${isFullscreen ? "text-xs" : "text-sm"}`}>
            {stillPlaying.map((e) => (
              <span key={e.id} className="rounded border border-steel px-2 py-1">
                {e.nickname}
              </span>
            ))}
            {stillPlaying.length === 0 && <span className="text-muted">Nobody's currently seated.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
