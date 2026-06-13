import { useCallback, useEffect, useState } from "react";
import { useMe } from "../lib/useMe";
import { usePageMeta } from "../lib/usePageMeta";

/** The ops cockpit (§18): dense, fast, same language. Role-gated. */

type Tab = "dashboard" | "sessions" | "submissions" | "scheme" | "seasons" | "users" | "banner";

const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : {},
    ...init,
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Failed");
  return res.json() as Promise<T>;
};

const btn =
  "rounded border border-steel px-2.5 py-1 text-xs hover:border-ember hover:text-ember disabled:opacity-40";
const btnPrimary =
  "rounded bg-ember-deep px-3 py-1 font-display text-xs text-white hover:bg-ember disabled:opacity-40";
const inputCls = "rounded border border-steel bg-bg-0 px-2 py-1 text-sm outline-none focus:border-ember";

// ---------------------------------------------------------------------------

function Dashboard() {
  const [data, setData] = useState<{
    users: number;
    verifiedPct: number;
    signupsWeek: number;
    submissionsWeek: number;
    activeDay: number;
    live: { tables: number; seatedHumans: number; clients: number };
    recentActions: Array<{ action: string; actor: string; at: string }>;
  } | null>(null);
  useEffect(() => {
    void api<typeof data>("/api/admin/dashboard").then(setData);
  }, []);
  if (!data) return <p className="text-muted">Loading…</p>;
  const stat = (label: string, value: string | number) => (
    <div className="panel-steel rounded p-4">
      <div className="tnum font-display text-2xl">{value}</div>
      <div className="text-xs uppercase tracking-widest text-muted">{label}</div>
    </div>
  );
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stat("Accounts", data.users)}
        {stat("Verified", `${data.verifiedPct}%`)}
        {stat("Signups / 7d", data.signupsWeek)}
        {stat("Results / 7d", data.submissionsWeek)}
        {stat("Active / 24h", data.activeDay)}
        {stat("Live now", `${data.live.seatedHumans} @ ${data.live.tables}t`)}
      </div>
      <h3 className="mt-6 font-display text-sm uppercase tracking-widest text-muted">
        Recent admin actions
      </h3>
      <ul className="mt-2 space-y-1 text-xs text-muted">
        {data.recentActions.map((a, i) => (
          <li key={i}>
            <span className="text-text">{a.action}</span> — {a.actor} ·{" "}
            {new Date(a.at).toLocaleString("en-GB")}
          </li>
        ))}
        {data.recentActions.length === 0 && <li>Nothing yet.</li>}
      </ul>
    </div>
  );
}

function Sessions() {
  interface Row {
    id: string;
    type: string;
    date: string;
    code: string;
    status: string;
    submissions: number;
  }
  const [rows, setRows] = useState<Row[]>([]);
  const [oneOffDate, setOneOffDate] = useState("");
  const [oneOffType, setOneOffType] = useState<"TOURNAMENT" | "CASH">("TOURNAMENT");
  const load = useCallback(() => void api<Row[]>("/api/admin/sessions").then(setRows), []);
  useEffect(load, [load]);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((s) => (
          <div
            key={s.id}
            className={`panel-steel rounded-lg p-4 ${s.status === "CANCELLED" ? "opacity-50" : ""}`}
          >
            <div className="flex items-baseline justify-between">
              <span className="font-display text-sm">
                {new Date(s.date).toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </span>
              <span className="text-xs uppercase tracking-widest text-muted">{s.type}</span>
            </div>
            {/* The code, displayed BIG — this is the screen the host opens. */}
            <div className="tnum mt-2 text-center font-mono text-3xl font-bold tracking-[0.3em] text-ember">
              {s.code}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>{s.submissions} submissions</span>
              <span>{s.status}</span>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                className={btn}
                onClick={() =>
                  void api(`/api/admin/sessions/${s.id}/regenerate-code`, { method: "POST" }).then(
                    load,
                  )
                }
              >
                New code
              </button>
              {s.status === "SCHEDULED" && (
                <button
                  className={btn}
                  onClick={() =>
                    void api(`/api/admin/sessions/${s.id}/cancel`, { method: "POST" }).then(load)
                  }
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="panel-steel mt-4 flex flex-wrap items-center gap-2 rounded-lg p-4">
        <span className="font-display text-xs uppercase tracking-widest text-muted">
          Add one-off
        </span>
        <input
          type="date"
          value={oneOffDate}
          onChange={(e) => setOneOffDate(e.target.value)}
          className={inputCls}
        />
        <select
          value={oneOffType}
          onChange={(e) => setOneOffType(e.target.value as "TOURNAMENT" | "CASH")}
          className={inputCls}
        >
          <option value="TOURNAMENT">Tournament</option>
          <option value="CASH">Cash</option>
        </select>
        <button
          className={btnPrimary}
          disabled={!oneOffDate}
          onClick={() =>
            void api("/api/admin/sessions", {
              method: "POST",
              body: JSON.stringify({ date: oneOffDate, type: oneOffType }),
            }).then(load)
          }
        >
          Create
        </button>
      </div>
    </div>
  );
}

function Submissions() {
  interface Row {
    id: string;
    nickname: string;
    sessionType: string;
    sessionDate: string;
    finishingPosition: number | null;
    entrantCount: number | null;
    points: number | null;
    netChips: number | null;
    voided: boolean;
  }
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const load = useCallback(
    () =>
      void api<Row[]>(`/api/admin/submissions${q ? `?q=${encodeURIComponent(q)}` : ""}`).then(
        setRows,
      ),
    [q],
  );
  useEffect(load, [load]);

  return (
    <div>
      <input
        placeholder="Filter by nickname or email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className={`${inputCls} w-64`}
      />
      <table className="mt-3 w-full text-xs">
        <thead>
          <tr className="border-b border-line text-left uppercase tracking-widest text-muted">
            <th className="py-2 pr-2">Player</th>
            <th className="py-2 pr-2">Session</th>
            <th className="py-2 pr-2">Result</th>
            <th className="py-2 pr-2">Value</th>
            <th className="py-2 pr-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className={`border-b border-line/40 ${s.voided ? "opacity-40" : ""}`}>
              <td className="py-1.5 pr-2 font-display">{s.nickname}</td>
              <td className="py-1.5 pr-2 text-muted">
                {s.sessionType} · {new Date(s.sessionDate).toLocaleDateString("en-GB")}
              </td>
              <td className="py-1.5 pr-2">
                {s.finishingPosition !== null
                  ? `${s.finishingPosition}/${s.entrantCount}`
                  : s.netChips !== null
                    ? `net ${s.netChips >= 0 ? "+" : ""}${s.netChips}`
                    : "—"}
              </td>
              <td className="tnum py-1.5 pr-2">{s.points ?? s.netChips ?? "—"}</td>
              <td className="py-1.5">
                {s.voided ? (
                  <button
                    className={btn}
                    onClick={() =>
                      void api(`/api/admin/submissions/${s.id}/restore`, { method: "POST" }).then(
                        load,
                      )
                    }
                  >
                    Restore
                  </button>
                ) : (
                  <button
                    className={btn}
                    onClick={() =>
                      void api(`/api/admin/submissions/${s.id}/void`, { method: "POST" }).then(load)
                    }
                  >
                    Void
                  </button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-muted">
                No submissions.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Scheme() {
  const [seasons, setSeasons] = useState<Array<{ id: string; name: string; isActive: boolean }>>([]);
  const [seasonId, setSeasonId] = useState("");
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [participation, setParticipation] = useState(1);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void api<typeof seasons>("/api/seasons").then((list) => {
      setSeasons(list);
      const active = list.find((s) => s.isActive);
      if (active) setSeasonId(active.id);
    });
  }, []);
  useEffect(() => {
    if (!seasonId) return;
    void api<{ scheme: { positions: Record<string, number>; participation: number } | null }>(
      `/api/admin/points-scheme/${seasonId}`,
    ).then(({ scheme }) => {
      setPositions(scheme?.positions ?? { "1": 10, "2": 7, "3": 5, "4": 3, "5": 2 });
      setParticipation(scheme?.participation ?? 1);
    });
  }, [seasonId]);

  const save = () =>
    void api<{ recomputed: number }>(`/api/admin/points-scheme/${seasonId}`, {
      method: "PUT",
      body: JSON.stringify({ positions, participation }),
    }).then(({ recomputed }) => setStatus(`Saved — ${recomputed} submissions recomputed.`));

  return (
    <div className="max-w-md">
      <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className={inputCls}>
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.isActive ? " (current)" : ""}
          </option>
        ))}
      </select>
      <div className="panel-steel mt-3 rounded-lg p-4">
        {Object.entries(positions)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([pos, pts]) => (
            <div key={pos} className="mb-2 flex items-center gap-3">
              <span className="w-16 font-display text-sm text-muted">{pos}.</span>
              <input
                type="number"
                value={pts}
                min={0}
                onChange={(e) => setPositions({ ...positions, [pos]: Number(e.target.value) })}
                className={`${inputCls} tnum w-24`}
                aria-label={`Points for position ${pos}`}
              />
            </div>
          ))}
        <div className="mb-2 flex items-center gap-3">
          <span className="w-16 font-display text-sm text-muted">Others</span>
          <input
            type="number"
            value={participation}
            min={0}
            onChange={(e) => setParticipation(Number(e.target.value))}
            className={`${inputCls} tnum w-24`}
            aria-label="Participation points"
          />
        </div>
        {/* Live preview */}
        <p className="mt-3 text-xs text-muted">
          Preview:{" "}
          {Object.entries(positions)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([p, v]) => `${p}st/nd/rd ${v}`.replace(/^(\d+)st\/nd\/rd/, "$1 →"))
            .join(" · ")}{" "}
          · everyone else → {participation}
        </p>
        <button className={`${btnPrimary} mt-3`} onClick={save}>
          Save & recompute season
        </button>
        {status && <p className="mt-2 text-xs text-gold">{status}</p>}
      </div>
    </div>
  );
}

function Seasons() {
  const [seasons, setSeasons] = useState<
    Array<{ id: string; name: string; isActive: boolean; startsAt: string; endsAt: string }>
  >([]);
  const [name, setName] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const load = useCallback(() => void api<typeof seasons>("/api/seasons").then(setSeasons), []);
  useEffect(load, [load]);

  return (
    <div className="max-w-xl">
      <ul className="space-y-2">
        {seasons.map((s) => (
          <li key={s.id} className="panel-steel flex items-center justify-between rounded p-3">
            <span className="font-display text-sm">
              {s.name}
              {s.isActive && <span className="ml-2 text-xs text-gold">active</span>}
            </span>
            {s.isActive && (
              <button
                className={btn}
                onClick={() => {
                  if (!window.confirm(`End ${s.name}? Champions go to the Hall of Fame.`)) return;
                  void api<{
                    tournamentChampion: { nickname: string } | null;
                    cashChampion: { nickname: string } | null;
                  }>(`/api/admin/seasons/${s.id}/end`, { method: "POST" }).then((r) => {
                    setResult(
                      `Season ended. Champions: ${r.tournamentChampion?.nickname ?? "—"} (Tue), ${r.cashChampion?.nickname ?? "—"} (Thu).`,
                    );
                    load();
                  });
                }}
              >
                End season
              </button>
            )}
          </li>
        ))}
      </ul>
      {result && <p className="mt-2 text-xs text-gold">{result}</p>}
      <div className="panel-steel mt-4 flex flex-wrap items-end gap-2 rounded-lg p-4">
        <label className="text-xs text-muted">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mt-1 block`} />
        </label>
        <label className="text-xs text-muted">
          Starts
          <input type="date" value={starts} onChange={(e) => setStarts(e.target.value)} className={`${inputCls} mt-1 block`} />
        </label>
        <label className="text-xs text-muted">
          Ends
          <input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} className={`${inputCls} mt-1 block`} />
        </label>
        <button
          className={btnPrimary}
          disabled={!name || !starts || !ends}
          onClick={() =>
            void api("/api/admin/seasons", {
              method: "POST",
              body: JSON.stringify({ name, startsAt: starts, endsAt: ends }),
            }).then(load)
          }
        >
          Create season
        </button>
      </div>
    </div>
  );
}

function Users() {
  interface Row {
    id: string;
    email: string;
    nickname: string | null;
    role: string;
    chatBanned: boolean;
    suspended: boolean;
  }
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const load = useCallback(
    () => void api<Row[]>(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`).then(setRows),
    [q],
  );
  useEffect(load, [load]);
  const act = (id: string, path: string) => () =>
    void api(`/api/admin/users/${id}/${path}`, { method: "POST" }).then(load);

  return (
    <div>
      <input
        placeholder="Search email or nickname…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className={`${inputCls} w-64`}
      />
      <table className="mt-3 w-full text-xs">
        <thead>
          <tr className="border-b border-line text-left uppercase tracking-widest text-muted">
            <th className="py-2 pr-2">Player</th>
            <th className="py-2 pr-2">Email</th>
            <th className="py-2 pr-2">Role</th>
            <th className="py-2 pr-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-b border-line/40">
              <td className="py-1.5 pr-2 font-display">{u.nickname ?? "—"}</td>
              <td className="py-1.5 pr-2 text-muted">{u.email}</td>
              <td className="py-1.5 pr-2">{u.role}</td>
              <td className="flex flex-wrap gap-1 py-1.5">
                <button
                  className={btn}
                  onClick={() => {
                    const nickname = window.prompt("New nickname:");
                    if (nickname) {
                      void api(`/api/admin/users/${u.id}/rename`, {
                        method: "POST",
                        body: JSON.stringify({ nickname }),
                      })
                        .then(load)
                        .catch((e: Error) => window.alert(e.message));
                    }
                  }}
                >
                  Rename
                </button>
                <button className={btn} onClick={act(u.id, u.chatBanned ? "chat-unban" : "chat-ban")}>
                  {u.chatBanned ? "Unban chat" : "Ban chat"}
                </button>
                <button className={btn} onClick={act(u.id, u.suspended ? "unsuspend" : "suspend")}>
                  {u.suspended ? "Unsuspend" : "Suspend"}
                </button>
                {u.role !== "ADMIN" && (
                  <button
                    className={btn}
                    onClick={() => {
                      if (window.confirm(`Promote ${u.email} to admin?`)) act(u.id, "promote")();
                    }}
                  >
                    Promote
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Banner() {
  const [message, setMessage] = useState("");
  const [current, setCurrent] = useState<string | null>(null);
  const load = useCallback(
    () =>
      void api<{ message: string | null }>("/api/announcement").then((r) => setCurrent(r.message)),
    [],
  );
  useEffect(load, [load]);
  return (
    <div className="max-w-lg">
      <p className="text-sm text-muted">
        Current banner: {current ? <span className="text-text">{current}</span> : "none"}
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Site-wide announcement…"
          maxLength={300}
          className={`${inputCls} flex-1`}
        />
        <button
          className={btnPrimary}
          disabled={!message.trim()}
          onClick={() =>
            void api("/api/admin/announcement", {
              method: "PUT",
              body: JSON.stringify({ message: message.trim() }),
            }).then(() => {
              setMessage("");
              load();
            })
          }
        >
          Set banner
        </button>
        {current && (
          <button
            className={btn}
            onClick={() =>
              void api("/api/admin/announcement", { method: "DELETE" }).then(load)
            }
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const TABS: Array<[Tab, string]> = [
  ["dashboard", "Dashboard"],
  ["sessions", "Sessions"],
  ["submissions", "Submissions"],
  ["scheme", "Points scheme"],
  ["seasons", "Seasons"],
  ["users", "Users"],
  ["banner", "Banner"],
];

export function AdminPage() {
  usePageMeta("Admin");
  const { me, loading } = useMe();
  const [tab, setTab] = useState<Tab>("dashboard");

  if (loading) return null;
  if (me?.user?.role !== "ADMIN") {
    return (
      <section className="mx-auto max-w-md px-4 py-20 text-center text-muted">
        This room's for the committee.
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-2xl font-semibold tracking-[0.12em]">
        ADMIN <span className="text-ember">·</span> OPS
      </h1>
      <nav className="mt-4 flex flex-wrap gap-1">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded px-3 py-1.5 font-display text-xs tracking-wide ${
              tab === key ? "bg-steel text-text" : "text-muted hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="mt-5">
        {tab === "dashboard" && <Dashboard />}
        {tab === "sessions" && <Sessions />}
        {tab === "submissions" && <Submissions />}
        {tab === "scheme" && <Scheme />}
        {tab === "seasons" && <Seasons />}
        {tab === "users" && <Users />}
        {tab === "banner" && <Banner />}
      </div>
    </section>
  );
}
