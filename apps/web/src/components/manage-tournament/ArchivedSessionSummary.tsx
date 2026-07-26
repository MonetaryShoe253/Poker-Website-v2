import { useEffect, useState } from "react";
import { api, btn } from "../../lib/adminShared";
import { SessionEntriesTable } from "./SessionEntriesTable";

interface SessionDetail {
  closedAt: string | null;
  activePlayerCount: number | null;
}

export function ArchivedSessionSummary({
  sessionId,
  onUnarchived,
}: {
  sessionId: string;
  onUnarchived: () => void;
}) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<SessionDetail>(`/api/admin/sessions/${sessionId}`).then(setDetail);
  }, [sessionId]);

  const unarchive = () => {
    void api(`/api/admin/sessions/${sessionId}/unarchive`, { method: "POST" })
      .then(() => onUnarchived())
      .catch((e: Error) => setError(e.message));
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-ember">{error}</p>}
      <div className="panel-steel flex flex-wrap items-center justify-between gap-3 rounded-lg p-4 text-sm text-muted">
        <div>
          This session is archived — a permanent, read-only part of the series record.
          {detail?.closedAt && (
            <>
              {" "}
              Closed{" "}
              {new Date(detail.closedAt).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </>
          )}
        </div>
        <button className={btn} onClick={unarchive}>
          Undo: unarchive
        </button>
      </div>
      <div className="panel-steel rounded-lg p-4">
        <div className="font-display text-xs uppercase tracking-widest text-muted">Final sign-in / sign-out records</div>
        <div className="mt-3">
          <SessionEntriesTable sessionId={sessionId} editable={false} />
        </div>
      </div>
    </div>
  );
}
