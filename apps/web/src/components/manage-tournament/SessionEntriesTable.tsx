import { useCallback, useEffect, useState } from "react";
import { api, btn, inputCls } from "../../lib/adminShared";

type TournamentFormat = "REGULAR" | "BOUNTY";

interface EntryRow {
  id: string;
  playerId: string;
  nickname: string;
  email: string;
  signInTime: string;
  signOutTime: string | null;
  finishingPosition: number | null;
  entrantCount: number | null;
  points: number | null;
  bountiesCollected: number | null;
  bountyPoints: number | null;
  isDNF: boolean;
  voided: boolean;
  voidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const timeFmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";

export function SessionEntriesTable({
  sessionId,
  editable,
  refreshKey,
  format,
}: {
  sessionId: string;
  editable: boolean;
  refreshKey?: number;
  format?: TournamentFormat;
}) {
  const [rows, setRows] = useState<EntryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [posInput, setPosInput] = useState("");
  const [bountiesInput, setBountiesInput] = useState("");
  const showBounties = format === "BOUNTY";

  const load = useCallback(
    () => void api<EntryRow[]>(`/api/admin/sessions/${sessionId}/entries`).then(setRows),
    [sessionId],
  );
  useEffect(load, [load, refreshKey]);

  const startEdit = (row: EntryRow) => {
    setEditingId(row.id);
    setPosInput(row.finishingPosition && !row.isDNF ? String(row.finishingPosition) : "");
    setBountiesInput(row.bountiesCollected !== null ? String(row.bountiesCollected) : "0");
  };

  const savePoints = (id: string) => {
    const finishingPosition = Number(posInput);
    if (!Number.isInteger(finishingPosition) || finishingPosition < 1) {
      setError("Enter a valid finishing position.");
      return;
    }
    const bountiesCollected = Number(bountiesInput);
    if (showBounties && (!Number.isInteger(bountiesCollected) || bountiesCollected < 0)) {
      setError("Enter a valid bounty count.");
      return;
    }
    void api(`/api/admin/session-entries/${id}/points`, {
      method: "PATCH",
      body: JSON.stringify({ finishingPosition, ...(showBounties ? { bountiesCollected } : {}) }),
    })
      .then(() => {
        setEditingId(null);
        setError(null);
        load();
      })
      .catch((e: Error) => setError(e.message));
  };

  const markDnf = (id: string) => {
    void api(`/api/admin/session-entries/${id}/dnf`, { method: "POST" })
      .then(load)
      .catch((e: Error) => setError(e.message));
  };
  const unmarkDnf = (id: string) => {
    void api(`/api/admin/session-entries/${id}/dnf`, { method: "DELETE" })
      .then(load)
      .catch((e: Error) => setError(e.message));
  };

  const undoSignout = (id: string) => {
    void api(`/api/admin/session-entries/${id}/undo-signout`, { method: "POST" })
      .then(load)
      .catch((e: Error) => setError(e.message));
  };

  if (!rows) return <p className="text-muted">Loading entries…</p>;

  return (
    <div>
      {error && <p className="mb-2 text-sm text-ember">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line text-left uppercase tracking-widest text-muted">
              <th className="py-2 pr-2">Player</th>
              <th className="py-2 pr-2">Signed in</th>
              <th className="py-2 pr-2">Signed out</th>
              <th className="py-2 pr-2">Position</th>
              {showBounties && <th className="py-2 pr-2">Bounties</th>}
              <th className="py-2 pr-2">Points</th>
              {editable && <th className="py-2 pr-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line/40">
                <td className="py-1.5 pr-2 font-display">
                  {row.nickname}
                  {row.voided && <span className="ml-1 text-ember">(voided)</span>}
                </td>
                <td className="py-1.5 pr-2 tnum text-muted">{timeFmt(row.signInTime)}</td>
                <td className="py-1.5 pr-2 tnum text-muted">{timeFmt(row.signOutTime)}</td>
                <td className="py-1.5 pr-2 tnum">
                  {row.isDNF ? <span className="text-ember">DNF</span> : (row.finishingPosition ?? "—")}
                </td>
                {showBounties && <td className="py-1.5 pr-2 tnum">{row.bountiesCollected ?? 0}</td>}
                <td className="py-1.5 pr-2 tnum">{row.points ?? "—"}</td>
                {editable && (
                  <td className="py-1.5 pr-2">
                    {editingId === row.id ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <input
                          value={posInput}
                          onChange={(e) => setPosInput(e.target.value)}
                          placeholder="Pos"
                          className={`${inputCls} w-16`}
                        />
                        {showBounties && (
                          <input
                            value={bountiesInput}
                            onChange={(e) => setBountiesInput(e.target.value)}
                            placeholder="Bounties"
                            className={`${inputCls} w-16`}
                          />
                        )}
                        <button className={btn} onClick={() => savePoints(row.id)}>
                          Save
                        </button>
                        <button className={btn} onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        <button className={btn} onClick={() => startEdit(row)}>
                          Edit points
                        </button>
                        {row.isDNF ? (
                          <button className={btn} onClick={() => unmarkDnf(row.id)}>
                            Unmark DNF
                          </button>
                        ) : (
                          <button className={btn} onClick={() => markDnf(row.id)}>
                            Mark DNF
                          </button>
                        )}
                        {row.signOutTime && !row.isDNF && (
                          <button className={btn} onClick={() => undoSignout(row.id)}>
                            Undo sign-out
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={(editable ? 6 : 5) + (showBounties ? 1 : 0)}
                  className="py-3 text-center text-muted"
                >
                  No entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
