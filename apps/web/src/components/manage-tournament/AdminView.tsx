import { useCallback, useEffect, useState } from "react";
import { api, btn, btnPrimary, inputCls } from "../../lib/adminShared";
import { BlindLevelDisplay } from "./BlindLevelDisplay";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { SessionEntriesTable } from "./SessionEntriesTable";

type SessionStatus = "CREATED" | "SCHEDULED" | "OPEN" | "LATE_REG_CLOSED" | "CLOSED" | "ARCHIVED";

interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  durationMinutes: number;
  isBreak?: boolean;
}

type TournamentFormat = "REGULAR" | "BOUNTY";

interface SessionDetail {
  id: string;
  status: SessionStatus;
  format: TournamentFormat;
  activePlayerCount: number | null;
  blindSchedule: BlindLevel[] | null;
  currentBlindLevel: number;
  timerStartedAt: string | null;
  timerPausedAt: string | null;
  isPaused: boolean;
}

export function AdminView({
  sessionId,
  onChanged,
  onDeleted,
  sessionLabel,
}: {
  sessionId: string;
  onChanged: () => void;
  onDeleted: () => void;
  sessionLabel: string;
}) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCountInput, setActiveCountInput] = useState("");
  const [levels, setLevels] = useState<BlindLevel[]>([]);
  const [showDelete, setShowDelete] = useState(false);
  // SessionEntriesTable fetches its own data keyed on sessionId, which never
  // changes when a lifecycle action (e.g. Close, which finalizes everyone's
  // points) succeeds — bumping this forces it to refetch alongside us.
  const [entriesVersion, setEntriesVersion] = useState(0);

  const load = useCallback(() => {
    void api<SessionDetail>(`/api/admin/sessions/${sessionId}`).then((d) => {
      setDetail(d);
      setActiveCountInput(d.activePlayerCount !== null ? String(d.activePlayerCount) : "");
      setLevels(d.blindSchedule ?? []);
    });
  }, [sessionId]);
  useEffect(load, [load]);

  const run = (path: string, method: string, body?: unknown) => {
    void api(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
      .then(() => {
        setError(null);
        load();
        setEntriesVersion((v) => v + 1);
        onChanged();
      })
      .catch((e: Error) => setError(e.message));
  };

  if (!detail) return <p className="text-muted">Loading…</p>;

  const lifecycleAction = (() => {
    switch (detail.status) {
      case "CREATED":
      case "SCHEDULED":
        return { label: "Open session", path: `/api/admin/sessions/${sessionId}/open`, method: "POST" };
      case "OPEN":
        return {
          label: "Close late registration",
          path: `/api/admin/sessions/${sessionId}/late-reg-close`,
          method: "POST",
        };
      case "LATE_REG_CLOSED":
        return { label: "Close session", path: `/api/admin/sessions/${sessionId}/close`, method: "POST" };
      case "CLOSED":
        return { label: "Archive session", path: `/api/admin/sessions/${sessionId}/archive`, method: "POST" };
      default:
        return null;
    }
  })();

  const reverseAction = (() => {
    switch (detail.status) {
      case "OPEN":
        return { label: "Undo: back to scheduled", path: `/api/admin/sessions/${sessionId}/unopen`, method: "POST" };
      case "LATE_REG_CLOSED":
        return {
          label: "Undo: reopen registration",
          path: `/api/admin/sessions/${sessionId}/reopen-registration`,
          method: "POST",
        };
      case "CLOSED":
        return { label: "Undo: reopen session", path: `/api/admin/sessions/${sessionId}/reopen`, method: "POST" };
      case "ARCHIVED":
        return { label: "Undo: unarchive", path: `/api/admin/sessions/${sessionId}/unarchive`, method: "POST" };
      default:
        return null;
    }
  })();

  const formatEditable = detail.status === "CREATED" || detail.status === "SCHEDULED";
  const saveFormat = (format: TournamentFormat) => {
    run(`/api/admin/sessions/${sessionId}/format`, "PUT", { format });
  };

  const saveActiveCount = () => {
    const n = Number(activeCountInput);
    if (!Number.isInteger(n) || n < 0) {
      setError("Enter a valid active player count.");
      return;
    }
    run(`/api/admin/sessions/${sessionId}/active-player-count`, "PUT", { activePlayerCount: n });
  };

  const saveBlindSchedule = () => {
    run(`/api/admin/sessions/${sessionId}/blind-schedule`, "PUT", { levels });
  };

  const clearBlindSchedule = () => {
    setLevels([]);
    run(`/api/admin/sessions/${sessionId}/blind-schedule`, "PUT", { levels: [] });
  };

  const updateLevel = (i: number, patch: Partial<BlindLevel>) => {
    setLevels((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const addLevel = () => {
    setLevels((prev) => [
      ...prev,
      { level: prev.length, smallBlind: 0, bigBlind: 0, durationMinutes: 15 },
    ]);
  };
  const addBreak = () => {
    setLevels((prev) => [
      ...prev,
      { level: prev.length, smallBlind: 0, bigBlind: 0, durationMinutes: 15, isBreak: true },
    ]);
  };
  const removeLevel = (i: number) => {
    setLevels((prev) => prev.filter((_, idx) => idx !== i));
  };

  const currentLevel = detail.blindSchedule?.[detail.currentBlindLevel] ?? null;

  const deleteSession = () => {
    void api(`/api/admin/sessions/${sessionId}`, { method: "DELETE" })
      .then(() => onDeleted())
      .catch((e: Error) => setError(e.message));
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-ember">{error}</p>}

      <div className="panel-steel flex flex-wrap items-center justify-between gap-3 rounded-lg p-4">
        <div>
          <div className="font-display text-xs uppercase tracking-widest text-muted">Session lifecycle</div>
          <div className="mt-1 text-sm">{detail.status}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {reverseAction && (
            <button className={btn} onClick={() => run(reverseAction.path, reverseAction.method)}>
              {reverseAction.label}
            </button>
          )}
          {lifecycleAction && (
            <button className={btnPrimary} onClick={() => run(lifecycleAction.path, lifecycleAction.method)}>
              {lifecycleAction.label}
            </button>
          )}
        </div>
      </div>

      <div className="panel-steel rounded-lg p-4">
        <div className="font-display text-xs uppercase tracking-widest text-muted">Tournament format</div>
        {formatEditable ? (
          <div className="mt-2 flex items-center gap-2">
            <select
              value={detail.format}
              onChange={(e) => saveFormat(e.target.value as TournamentFormat)}
              className={inputCls}
            >
              <option value="REGULAR">Regular</option>
              <option value="BOUNTY">Bounty</option>
            </select>
          </div>
        ) : (
          <div className="mt-1 text-sm">
            {detail.format === "BOUNTY" ? "Bounty" : "Regular"}{" "}
            <span className="text-xs text-muted">— locked once the session opens</span>
          </div>
        )}
      </div>

      <div className="panel-steel rounded-lg p-4">
        <div className="font-display text-xs uppercase tracking-widest text-muted">
          Active players (live)
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            value={activeCountInput}
            onChange={(e) => setActiveCountInput(e.target.value)}
            className={`${inputCls} w-24`}
          />
          <button className={btn} onClick={saveActiveCount}>
            Save
          </button>
        </div>
      </div>

      <div className="panel-steel rounded-lg p-4 ring-1 ring-ember/25">
        <div className="font-display text-xs uppercase tracking-widest text-muted">Now playing</div>
        <div className="mt-3">
          <BlindLevelDisplay
            level={currentLevel}
            levelNumber={detail.currentBlindLevel + 1}
            totalLevels={levels.length}
            timerStartedAt={detail.timerStartedAt}
            timerPausedAt={detail.timerPausedAt}
            isPaused={detail.isPaused}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {!detail.timerStartedAt && (detail.status === "OPEN" || detail.status === "LATE_REG_CLOSED") && (
            <button className={btnPrimary} onClick={() => run(`/api/admin/sessions/${sessionId}/timer/start`, "POST")}>
              Start timer
            </button>
          )}
          {!detail.timerStartedAt && detail.status !== "OPEN" && detail.status !== "LATE_REG_CLOSED" && (
            <p className="text-xs text-muted">Open the session to start the blind timer.</p>
          )}
          {detail.timerStartedAt && !detail.isPaused && (
            <button className={btn} onClick={() => run(`/api/admin/sessions/${sessionId}/timer/pause`, "POST")}>
              Pause
            </button>
          )}
          {detail.timerStartedAt && detail.isPaused && (
            <button className={btn} onClick={() => run(`/api/admin/sessions/${sessionId}/timer/resume`, "POST")}>
              Resume
            </button>
          )}
          {detail.timerStartedAt && (
            <button className={btn} onClick={() => run(`/api/admin/sessions/${sessionId}/timer/advance`, "POST")}>
              Advance level
            </button>
          )}
        </div>
      </div>

      <div className="panel-steel rounded-lg p-4">
        <div className="font-display text-xs uppercase tracking-widest text-muted">Edit blind schedule</div>

        <div className="mt-3 space-y-2">
          {levels.map((l, i) =>
            l.isBreak ? (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 rounded border border-purple-400/30 bg-purple-400/10 px-2 py-1.5 text-sm"
              >
                <span className="w-6 text-muted">{i + 1}.</span>
                <span className="font-display text-xs uppercase tracking-widest text-purple-300">Break</span>
                <input
                  value={l.durationMinutes}
                  onChange={(e) => updateLevel(i, { durationMinutes: Number(e.target.value) })}
                  placeholder="Mins"
                  className={`${inputCls} w-16`}
                />
                <button className={btn} onClick={() => removeLevel(i)}>
                  Remove
                </button>
              </div>
            ) : (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-6 text-muted">{i + 1}.</span>
                <input
                  value={l.smallBlind}
                  onChange={(e) => updateLevel(i, { smallBlind: Number(e.target.value) })}
                  placeholder="SB"
                  className={`${inputCls} w-20`}
                />
                <input
                  value={l.bigBlind}
                  onChange={(e) => updateLevel(i, { bigBlind: Number(e.target.value) })}
                  placeholder="BB"
                  className={`${inputCls} w-20`}
                />
                <input
                  value={l.ante ?? ""}
                  onChange={(e) => updateLevel(i, { ante: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="Ante"
                  className={`${inputCls} w-16`}
                />
                <input
                  value={l.durationMinutes}
                  onChange={(e) => updateLevel(i, { durationMinutes: Number(e.target.value) })}
                  placeholder="Mins"
                  className={`${inputCls} w-16`}
                />
                <button className={btn} onClick={() => removeLevel(i)}>
                  Remove
                </button>
              </div>
            ),
          )}
          {levels.length === 0 && <p className="text-muted">No blind levels set.</p>}
          <div className="flex flex-wrap gap-2">
            <button className={btn} onClick={addLevel}>
              Add level
            </button>
            <button className={btn} onClick={addBreak}>
              Add break
            </button>
            <button className={btnPrimary} onClick={saveBlindSchedule}>
              Save schedule
            </button>
            {levels.length > 0 && (
              <button className={btn} onClick={clearBlindSchedule}>
                Clear schedule
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="panel-steel rounded-lg p-4">
        <div className="font-display text-xs uppercase tracking-widest text-muted">Sign-in / sign-out records</div>
        <div className="mt-3">
          <SessionEntriesTable
            sessionId={sessionId}
            editable={detail.status !== "CREATED" && detail.status !== "SCHEDULED" && detail.status !== "ARCHIVED"}
            refreshKey={entriesVersion}
            format={detail.format}
          />
        </div>
      </div>

      <div className="rounded-lg border border-ember/30 p-4">
        <div className="font-display text-xs uppercase tracking-widest text-ember">Danger zone</div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Permanently delete this session and all of its sign-in records and results.
          </p>
          <button
            className="rounded border border-ember/50 px-2.5 py-1 text-xs text-ember hover:bg-ember/10"
            onClick={() => setShowDelete(true)}
          >
            Delete session
          </button>
        </div>
      </div>

      {showDelete && (
        <ConfirmDeleteModal
          title="Delete session"
          itemLabel={sessionLabel}
          warning="This permanently deletes this session, its blind schedule, and every sign-in/sign-out record and result. This cannot be undone."
          onConfirm={deleteSession}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}
