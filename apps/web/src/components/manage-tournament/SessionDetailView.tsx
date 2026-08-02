import { useCallback, useEffect, useState } from "react";
import { api, tabButtonClass } from "../../lib/adminShared";
import { formatOrdinal } from "../../lib/format";
import { ArchivedSessionSummary } from "./ArchivedSessionSummary";
import { AdminView } from "./AdminView";
import { KioskView } from "./KioskView";
import { TournamentInfoView } from "./TournamentInfoView";

type SessionStatus = "CREATED" | "SCHEDULED" | "OPEN" | "LATE_REG_CLOSED" | "CLOSED" | "ARCHIVED";
type TournamentFormat = "REGULAR" | "BOUNTY";

interface SessionDetail {
  id: string;
  seriesId: string;
  seriesName: string;
  type: "TOURNAMENT" | "CASH";
  date: string;
  status: SessionStatus;
  format: TournamentFormat;
  ordinal: number | null;
  closedAt: string | null;
  scheduledStartAt: string | null;
  lateRegClosesAt: string | null;
  estimatedEndAt: string | null;
}

const formatLondonTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });

type Tab = "kiosk" | "info" | "admin";
const TABS: Array<[Tab, string]> = [
  ["kiosk", "Kiosk View"],
  ["info", "Tournament Info"],
  ["admin", "Admin"],
];

export function SessionDetailView({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [tab, setTab] = useState<Tab>("admin");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void api<SessionDetail>(`/api/admin/sessions/${sessionId}`)
      .then(setDetail)
      .catch((e: Error) => setError(e.message));
  }, [sessionId]);
  useEffect(load, [load]);

  return (
    <div>
      <button onClick={onBack} className="text-xs text-muted underline hover:text-text">
        ← Back to sessions
      </button>

      {error && <p className="mt-3 text-sm text-ember">{error}</p>}
      {!detail && !error && <p className="mt-3 text-muted">Loading…</p>}

      {detail && (
        <>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl tracking-wide">
              {detail.seriesName} <span className="text-ember">·</span>{" "}
              {detail.ordinal ? formatOrdinal(detail.ordinal) : "—"} tournament
            </h2>
            <span className="flex items-center gap-2">
              {detail.format === "BOUNTY" && (
                <span className="rounded border border-ember/50 px-1.5 py-0.5 text-xs uppercase tracking-widest text-ember">
                  Bounty
                </span>
              )}
              <span className="text-xs uppercase tracking-widest text-muted">{detail.status}</span>
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {new Date(detail.date).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {detail.scheduledStartAt && (
              <>
                {" · Starts "}
                {formatLondonTime(detail.scheduledStartAt)}
                {detail.lateRegClosesAt && <> · Late reg until {formatLondonTime(detail.lateRegClosesAt)}</>}
                {detail.estimatedEndAt && <> · Runs until ~{formatLondonTime(detail.estimatedEndAt)}</>}
              </>
            )}
          </p>

          {detail.status === "ARCHIVED" ? (
            <div className="mt-4">
              <ArchivedSessionSummary sessionId={sessionId} onUnarchived={load} />
            </div>
          ) : (
            <>
              <nav className="mt-4 flex flex-wrap gap-1">
                {TABS.map(([key, label]) => (
                  <button key={key} onClick={() => setTab(key)} className={tabButtonClass(tab === key)}>
                    {label}
                  </button>
                ))}
              </nav>
              <div className="mt-5">
                {tab === "kiosk" && (
                  <KioskView sessionId={sessionId} sessionStatus={detail.status} format={detail.format} />
                )}
                {tab === "info" && <TournamentInfoView sessionId={sessionId} />}
                {tab === "admin" && (
                  <AdminView
                    sessionId={sessionId}
                    onChanged={load}
                    onDeleted={onBack}
                    sessionLabel={`${detail.ordinal ? formatOrdinal(detail.ordinal) : "session"} tournament ${new Date(detail.date).toLocaleDateString("en-GB")}`}
                  />
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
