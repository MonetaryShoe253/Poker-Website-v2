import { useEffect, useMemo, useRef, useState } from "react";

type Tab = "tournament" | "cash" | "elo";

interface SeasonInfo {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

interface TournamentRow {
  rank: number;
  nickname: string;
  points: number;
  bestFinish: number | null;
  avgFinish: number | null;
  finalTables: number;
  weeksPlayed: number;
  currentStreak: number | null;
}
interface CashRow {
  rank: number;
  nickname: string;
  net: number;
  sessions: number;
  biggestNight: number | null;
  movement: number;
}
interface EloBoard {
  entries: Array<{
    rank: number;
    nickname: string | null;
    elo: number;
    ratedHands: number;
    provisional: boolean;
  }>;
  climbers: Array<{ nickname: string | null; climb: number }>;
}

function Movement({ value }: { value: number }) {
  if (value > 0) return <span className="text-green-400">▲{value}</span>;
  if (value < 0) return <span className="text-ember">▼{-value}</span>;
  return <span className="text-muted">—</span>;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="font-display font-bold text-gold">1</span>;
  if (rank <= 3) return <span className="font-display font-semibold text-text">{rank}</span>;
  return <span className="text-muted">{rank}</span>;
}

type TournamentSortKey = "points" | "avgFinish" | "bestFinish";

export function LeaderboardsPage() {
  const [tab, setTab] = useState<Tab>("tournament");
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);
  // Defaults to the most recently created series once /api/seasons loads
  // (see the effect below) — series aren't reliably flagged "active" (new
  // tournament series never are), so that's a better default than "all".
  const [seasonId, setSeasonId] = useState<string>("all");
  const [tournament, setTournament] = useState<TournamentRow[]>([]);
  const [cash, setCash] = useState<CashRow[]>([]);
  const [elo, setElo] = useState<EloBoard | null>(null);

  const [search, setSearch] = useState("");
  const [seriesSessions, setSeriesSessions] = useState<Array<{ id: string; ordinal: number; date: string }>>([]);
  const [fromOrdinal, setFromOrdinal] = useState<number | "">("");
  const [toOrdinal, setToOrdinal] = useState<number | "">("");
  const [sortKey, setSortKey] = useState<TournamentSortKey>("points");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (key: TournamentSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "points" ? "desc" : "asc");
    }
  };

  const sortIndicator = (key: TournamentSortKey) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  const displayedTournament = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = needle ? tournament.filter((r) => r.nickname.toLowerCase().includes(needle)) : tournament;
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [tournament, search, sortKey, sortDir]);

  useEffect(() => {
    void fetch("/api/seasons")
      .then((r) => r.json())
      .then((list: SeasonInfo[]) => {
        setSeasons(list);
        const newest = [...list].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0];
        if (newest) setSeasonId(newest.id);
      });
  }, []);

  // A "from session / to session" range only has one well-defined meaning
  // within a single series, so it's only offered once one is selected.
  useEffect(() => {
    setFromOrdinal("");
    setToOrdinal("");
    if (!seasonId || seasonId === "all") {
      setSeriesSessions([]);
      return;
    }
    void fetch(`/api/seasons/${seasonId}/tournament-sessions`)
      .then((r) => r.json())
      .then(setSeriesSessions);
  }, [seasonId]);

  const fromDate = fromOrdinal ? (seriesSessions[fromOrdinal - 1]?.date ?? "") : "";
  const toDate = toOrdinal ? (seriesSessions[toOrdinal - 1]?.date ?? "") : "";

  // Guards against a slower, now-stale request (e.g. the initial "all-time"
  // fetch that fires before the default-series effect resolves) clobbering
  // a newer response that already landed — only the latest request's result
  // is ever applied, no matter what order the responses arrive in.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (tab === "elo") {
      void fetch("/api/leaderboards/elo")
        .then((r) => r.json())
        .then((data) => {
          if (requestId === requestIdRef.current) setElo(data);
        });
      return;
    }
    const params = new URLSearchParams();
    if (seasonId) params.set("seasonId", seasonId);
    if (tab === "tournament") {
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      void fetch(`/api/leaderboards/tournament?${params}`)
        .then((r) => r.json())
        .then((data) => {
          if (requestId === requestIdRef.current) setTournament(data);
        });
    } else {
      void fetch(`/api/leaderboards/cash?${params}`)
        .then((r) => r.json())
        .then((data) => {
          if (requestId === requestIdRef.current) setCash(data);
        });
    }
  }, [tab, seasonId, fromDate, toDate]);

  const tabButton = (key: Tab, label: string) => (
    <button
      onClick={() => setTab(key)}
      className={`rounded px-4 py-2 font-display text-sm tracking-wide ${
        tab === key ? "bg-steel text-text" : "text-muted hover:text-text"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold tracking-[0.12em]">LEADERBOARDS</h1>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {tabButton("tournament", "Tuesday · Points")}
        {tabButton("cash", "Thursday · Net chips")}
        {tabButton("elo", "Online · Elo")}
        {tab !== "elo" && (
          <select
            value={seasonId}
            onChange={(e) => setSeasonId(e.target.value)}
            className="ml-auto rounded border border-steel bg-bg-0 px-2 py-1.5 text-sm"
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isActive ? " (current)" : ""}
              </option>
            ))}
            <option value="all">All-time</option>
          </select>
        )}
      </div>

      {tab === "tournament" && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player…"
            className="rounded border border-steel bg-bg-0 px-2 py-1.5 text-sm"
          />
          {seriesSessions.length > 0 && (
            <>
              <label className="flex items-center gap-1 text-xs text-muted">
                From session
                <select
                  value={fromOrdinal}
                  onChange={(e) => setFromOrdinal(e.target.value ? Number(e.target.value) : "")}
                  className="rounded border border-steel bg-bg-0 px-2 py-1.5 text-sm text-text"
                >
                  <option value="">1st</option>
                  {seriesSessions.map((s) => (
                    <option key={s.id} value={s.ordinal}>
                      {s.ordinal}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1 text-xs text-muted">
                Through session
                <select
                  value={toOrdinal}
                  onChange={(e) => setToOrdinal(e.target.value ? Number(e.target.value) : "")}
                  className="rounded border border-steel bg-bg-0 px-2 py-1.5 text-sm text-text"
                >
                  <option value="">Last</option>
                  {seriesSessions.map((s) => (
                    <option key={s.id} value={s.ordinal}>
                      {s.ordinal}
                    </option>
                  ))}
                </select>
              </label>
              {(fromOrdinal || toOrdinal) && (
                <button
                  onClick={() => {
                    setFromOrdinal("");
                    setToOrdinal("");
                  }}
                  className="text-xs text-muted underline hover:text-text"
                >
                  Clear range
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className="panel-steel mt-4 overflow-x-auto rounded-lg">
        {tab === "tournament" && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-widest text-muted">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Player</th>
                <th className="tnum px-4 py-3 text-right">
                  <button onClick={() => toggleSort("points")} className="hover:text-text">
                    Points{sortIndicator("points")}
                  </button>
                </th>
                <th className="tnum px-4 py-3 text-right">Streak</th>
                <th className="tnum px-4 py-3 text-right">
                  <button onClick={() => toggleSort("bestFinish")} className="hover:text-text">
                    Best finish{sortIndicator("bestFinish")}
                  </button>
                </th>
                <th className="tnum px-4 py-3 text-right">
                  <button onClick={() => toggleSort("avgFinish")} className="hover:text-text">
                    Avg finish{sortIndicator("avgFinish")}
                  </button>
                </th>
                <th className="tnum px-4 py-3 text-right">Weeks played</th>
                <th className="tnum px-4 py-3 text-right">Final tables</th>
              </tr>
            </thead>
            <tbody>
              {displayedTournament.map((row) => (
                <tr key={row.rank} className="border-b border-line/50">
                  <td className="px-4 py-2.5">
                    <RankBadge rank={row.rank} />
                  </td>
                  <td className={`px-4 py-2.5 font-display ${row.rank === 1 ? "text-gold" : ""}`}>
                    {row.nickname}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right">{row.points}</td>
                  <td className="tnum px-4 py-2.5 text-right">{row.currentStreak ?? "—"}</td>
                  <td className="tnum px-4 py-2.5 text-right">{row.bestFinish ?? "—"}</td>
                  <td className="tnum px-4 py-2.5 text-right">{row.avgFinish ?? "—"}</td>
                  <td className="tnum px-4 py-2.5 text-right">{row.weeksPlayed}</td>
                  <td className="tnum px-4 py-2.5 text-right">{row.finalTables}</td>
                </tr>
              ))}
              {displayedTournament.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">
                    No results yet this season. Tuesday's your chance.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === "cash" && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-widest text-muted">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Player</th>
                <th className="tnum px-4 py-3 text-right">Net</th>
                <th className="tnum px-4 py-3 text-right">Nights</th>
                <th className="tnum px-4 py-3 text-right">Best night</th>
                <th className="px-4 py-3 text-right">Week</th>
              </tr>
            </thead>
            <tbody>
              {cash.map((row) => (
                <tr key={row.rank} className="border-b border-line/50">
                  <td className="px-4 py-2.5">
                    <RankBadge rank={row.rank} />
                  </td>
                  <td className={`px-4 py-2.5 font-display ${row.rank === 1 ? "text-gold" : ""}`}>
                    {row.nickname}
                  </td>
                  <td
                    className={`tnum px-4 py-2.5 text-right ${row.net >= 0 ? "text-green-400" : "text-ember"}`}
                  >
                    {row.net >= 0 ? "+" : ""}
                    {row.net.toLocaleString()}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right">{row.sessions}</td>
                  <td className="tnum px-4 py-2.5 text-right">
                    {row.biggestNight !== null ? row.biggestNight.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Movement value={row.movement} />
                  </td>
                </tr>
              ))}
              {cash.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    No results yet this season. Thursday's your chance.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === "elo" && (
          <div className="grid gap-4 p-4 md:grid-cols-[1fr_220px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-widest text-muted">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Player</th>
                  <th className="tnum px-4 py-3 text-right">Rating</th>
                  <th className="tnum px-4 py-3 text-right">Hands</th>
                </tr>
              </thead>
              <tbody>
                {(elo?.entries ?? []).map((row) => (
                  <tr key={row.rank} className="border-b border-line/50">
                    <td className="px-4 py-2.5">
                      <RankBadge rank={row.rank} />
                    </td>
                    <td className={`px-4 py-2.5 font-display ${row.rank === 1 ? "text-gold" : ""}`}>
                      {row.nickname}
                      {row.provisional && <span className="ml-1 text-xs text-muted">(prov.)</span>}
                    </td>
                    <td className="tnum px-4 py-2.5 text-right">{row.elo}</td>
                    <td className="tnum px-4 py-2.5 text-right">{row.ratedHands}</td>
                  </tr>
                ))}
                {(elo?.entries.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted">
                      Nobody's past 50 rated hands yet. The ladder starts at the table.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <aside className="rounded border border-line p-3">
              <h3 className="font-display text-xs uppercase tracking-widest text-muted">
                Biggest climbers
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {(elo?.climbers ?? []).map((c, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{c.nickname}</span>
                    <span className="tnum text-green-400">+{c.climb}</span>
                  </li>
                ))}
                {(elo?.climbers.length ?? 0) === 0 && (
                  <li className="text-muted">No movement yet.</li>
                )}
              </ul>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
