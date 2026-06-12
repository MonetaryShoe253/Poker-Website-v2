import { useEffect, useState } from "react";

type Tab = "tournament" | "cash" | "elo";

interface SeasonInfo {
  id: string;
  name: string;
  isActive: boolean;
}

interface TournamentRow {
  rank: number;
  nickname: string;
  points: number;
  bestFinish: number | null;
  sessions: number;
  movement: number;
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

export function LeaderboardsPage() {
  const [tab, setTab] = useState<Tab>("tournament");
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);
  const [seasonId, setSeasonId] = useState<string>("");
  const [tournament, setTournament] = useState<TournamentRow[]>([]);
  const [cash, setCash] = useState<CashRow[]>([]);
  const [elo, setElo] = useState<EloBoard | null>(null);

  useEffect(() => {
    void fetch("/api/seasons")
      .then((r) => r.json())
      .then((list: SeasonInfo[]) => {
        setSeasons(list);
        const active = list.find((s) => s.isActive);
        if (active) setSeasonId(active.id);
      });
  }, []);

  useEffect(() => {
    if (tab === "elo") {
      void fetch("/api/leaderboards/elo")
        .then((r) => r.json())
        .then(setElo);
      return;
    }
    const q = seasonId ? `?seasonId=${seasonId}` : "";
    if (tab === "tournament") {
      void fetch(`/api/leaderboards/tournament${q}`)
        .then((r) => r.json())
        .then(setTournament);
    } else {
      void fetch(`/api/leaderboards/cash${q}`)
        .then((r) => r.json())
        .then(setCash);
    }
  }, [tab, seasonId]);

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

      <div className="panel-steel mt-4 overflow-x-auto rounded-lg">
        {tab === "tournament" && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-widest text-muted">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Player</th>
                <th className="tnum px-4 py-3 text-right">Points</th>
                <th className="tnum px-4 py-3 text-right">Best finish</th>
                <th className="tnum px-4 py-3 text-right">Played</th>
                <th className="px-4 py-3 text-right">Week</th>
              </tr>
            </thead>
            <tbody>
              {tournament.map((row) => (
                <tr key={row.rank} className="border-b border-line/50">
                  <td className="px-4 py-2.5">
                    <RankBadge rank={row.rank} />
                  </td>
                  <td className={`px-4 py-2.5 font-display ${row.rank === 1 ? "text-gold" : ""}`}>
                    {row.nickname}
                  </td>
                  <td className="tnum px-4 py-2.5 text-right">{row.points}</td>
                  <td className="tnum px-4 py-2.5 text-right">{row.bestFinish ?? "—"}</td>
                  <td className="tnum px-4 py-2.5 text-right">{row.sessions}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Movement value={row.movement} />
                  </td>
                </tr>
              ))}
              {tournament.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    No results yet this season — Tuesday's your chance.
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
                    No results yet this season — Thursday's your chance.
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
