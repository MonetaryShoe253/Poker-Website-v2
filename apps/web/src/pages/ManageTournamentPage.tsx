import { useCallback, useEffect, useState } from "react";
import { api, btn, inputCls } from "../lib/adminShared";
import { formatOrdinal } from "../lib/format";
import { useMe } from "../lib/useMe";
import { usePageMeta } from "../lib/usePageMeta";
import { ConfirmDeleteModal } from "../components/manage-tournament/ConfirmDeleteModal";
import { CreateSeriesForm } from "../components/manage-tournament/CreateSeriesForm";
import { SeriesParamsPanel } from "../components/manage-tournament/SeriesParamsPanel";
import { SessionDetailView } from "../components/manage-tournament/SessionDetailView";
import { TournamentFormulaPanel } from "../components/manage-tournament/TournamentFormulaPanel";

interface Series {
  id: string;
  name: string;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
}

interface SessionListItem {
  id: string;
  type: "TOURNAMENT" | "CASH";
  date: string;
  status: string;
  ordinal: number;
  entryCount: number;
  activePlayerCount: number | null;
}

function pickDefaultSeries(list: Series[]): Series | null {
  return list.find((s) => s.isActive) ?? list[0] ?? null;
}

export function ManageTournamentPage() {
  usePageMeta("Tournament management");
  const { me, loading } = useMe();

  const [series, setSeries] = useState<Series[] | null>(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showDeleteSeries, setShowDeleteSeries] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveFromHash = useCallback((list: Series[]) => {
    let matched: Series | null = null;
    if (window.location.hash.length > 1) {
      try {
        const name = decodeURIComponent(window.location.hash.slice(1));
        matched = list.find((s) => s.name === name) ?? null;
      } catch {
        matched = null;
      }
    }
    setSelectedSeriesId((matched ?? pickDefaultSeries(list))?.id ?? null);
  }, []);

  const loadSeries = useCallback(
    (selectId?: string) => {
      void api<Series[]>("/api/seasons")
        .then((list) => {
          setSeries(list);
          if (selectId) {
            const chosen = list.find((s) => s.id === selectId);
            setSelectedSeriesId(selectId);
            if (chosen) history.replaceState(null, "", `#${encodeURIComponent(chosen.name)}`);
          } else {
            resolveFromHash(list);
          }
        })
        .catch((e: Error) => setError(e.message));
    },
    [resolveFromHash],
  );

  useEffect(() => loadSeries(), [loadSeries]);

  useEffect(() => {
    if (!series) return;
    const onHashChange = () => resolveFromHash(series);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [series, resolveFromHash]);

  const loadSessions = useCallback(() => {
    if (!selectedSeriesId) return;
    void api<SessionListItem[]>(`/api/admin/series/${selectedSeriesId}/sessions`)
      .then(setSessions)
      .catch((e: Error) => setError(e.message));
  }, [selectedSeriesId]);

  useEffect(loadSessions, [loadSessions]);

  if (loading) return null;
  if (me?.user?.role !== "ADMIN") {
    return (
      <section className="mx-auto max-w-md px-4 py-20 text-center text-muted">
        This room's for the committee.
      </section>
    );
  }

  const selectedSeries = series?.find((s) => s.id === selectedSeriesId) ?? null;

  const deleteSeries = () => {
    if (!selectedSeriesId) return;
    void api(`/api/admin/tournament-series/${selectedSeriesId}`, { method: "DELETE" })
      .then(() => {
        setShowDeleteSeries(false);
        setSelectedSeriesId(null);
        history.replaceState(null, "", window.location.pathname);
        loadSeries();
      })
      .catch((e: Error) => setError(e.message));
  };

  const handleSeriesChange = (id: string) => {
    setSelectedSeriesId(id);
    setSelectedSessionId(null);
    const chosen = series?.find((s) => s.id === id);
    if (chosen) {
      history.replaceState(null, "", `#${encodeURIComponent(chosen.name)}`);
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-2xl font-semibold tracking-[0.12em]">
        TOURNAMENT <span className="text-ember">·</span> MANAGEMENT
      </h1>

      {error && <p className="mt-3 text-sm text-ember">{error}</p>}

      {selectedSessionId ? (
        <div className="mt-5">
          <SessionDetailView
            sessionId={selectedSessionId}
            onBack={() => {
              setSelectedSessionId(null);
              loadSessions();
            }}
          />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {series?.length ? (
              <>
                <span className="font-display text-xs uppercase tracking-widest text-muted">Series</span>
                <select
                  value={selectedSeriesId ?? ""}
                  onChange={(e) => handleSeriesChange(e.target.value)}
                  className={inputCls}
                >
                  {series.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.isActive ? " (active)" : ""}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <p className="text-muted">No series yet.</p>
            )}
            <button className={btn} onClick={() => setShowCreateForm((v) => !v)}>
              {showCreateForm ? "Cancel" : "+ New tournament series"}
            </button>
            {selectedSeries && (
              <button
                className="rounded border border-ember/50 px-2.5 py-1 text-xs text-ember hover:bg-ember/10"
                onClick={() => setShowDeleteSeries(true)}
              >
                Delete series
              </button>
            )}
          </div>

          {showDeleteSeries && selectedSeries && (
            <ConfirmDeleteModal
              title="Delete tournament series"
              itemLabel={selectedSeries.name}
              warning="This permanently deletes the series and every session, sign-in record, and result under it. This cannot be undone."
              onConfirm={deleteSeries}
              onCancel={() => setShowDeleteSeries(false)}
            />
          )}

          {showCreateForm && (
            <CreateSeriesForm
              onCreated={(id) => {
                setShowCreateForm(false);
                loadSeries(id);
              }}
              onCancel={() => setShowCreateForm(false)}
            />
          )}

          {!showCreateForm && <TournamentFormulaPanel />}

          {selectedSeriesId && !showCreateForm && <SeriesParamsPanel seriesId={selectedSeriesId} />}

          <div className="mt-4 space-y-2">
            {sessions === null && <p className="text-muted">Loading sessions…</p>}
            {sessions?.length === 0 && (
              <p className="text-muted">No tournament sessions in this series yet.</p>
            )}
            {sessions?.map((s) => (
              <div
                key={s.id}
                className="panel-steel flex flex-wrap items-center justify-between gap-3 rounded-lg p-4"
              >
                <div>
                  <div className="font-display text-sm">
                    {formatOrdinal(s.ordinal)} tournament ·{" "}
                    {new Date(s.date).toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                  <div className="text-xs uppercase tracking-widest text-muted">
                    {s.status} · {s.entryCount} entries
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSessionId(s.id)}
                  className="rounded bg-ember-deep px-3 py-1 font-display text-xs text-white hover:bg-ember"
                >
                  Manage session
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
