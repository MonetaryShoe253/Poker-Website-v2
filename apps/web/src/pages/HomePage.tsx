import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { SpadeGlyph } from "../components/Wordmark";
import { EmberLink, GhostLink, Reveal, SectionTitle } from "../components/ui";
import { usePageMeta } from "../lib/usePageMeta";
import { SOCIETY } from "../content/society";

interface UpcomingSession {
  id: string;
  type: "TOURNAMENT" | "CASH";
  date: string;
}

interface TeaserRow {
  rank: number;
  nickname: string;
  points?: number;
  net?: number;
}

function Countdown({ to }: { to: Date }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const start = to.getTime() + 17 * 3_600_000; // sessions start 17:00
  const ms = Math.max(0, start - now);
  if (ms === 0) {
    return (
      <p className="font-display text-xl tracking-[0.18em] text-ember">
        ON RIGHT NOW — 'TIL 20:00
      </p>
    );
  }
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const cell = (value: number, label: string) => (
    <div className="panel-steel w-16 rounded px-2 py-2 text-center sm:w-20">
      <div className="tnum font-display text-2xl font-semibold text-text sm:text-3xl">
        {String(value).padStart(2, "0")}
      </div>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
    </div>
  );
  return (
    <div className="flex justify-center gap-2">
      {cell(days, "days")}
      {cell(hours, "hrs")}
      {cell(minutes, "min")}
      {cell(seconds, "sec")}
    </div>
  );
}

/** Deterministic pseudo-random particle field (no Math.random in render). */
function particles(count: number) {
  const out: Array<{ left: string; size: number; duration: number; delay: number }> = [];
  let seed = 9973;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    out.push({
      left: `${(next() * 100).toFixed(1)}%`,
      size: 2 + Math.round(next() * 3),
      duration: 14 + next() * 18,
      delay: -next() * 30,
    });
  }
  return out;
}

export function HomePage() {
  usePageMeta(
    "",
    "The University of Sheffield Poker Society — Tuesday tournaments, Thursday cash games, leaderboards, and a play-money online poker room.",
  );

  const [upcoming, setUpcoming] = useState<UpcomingSession[]>([]);
  const [tournamentTop, setTournamentTop] = useState<TeaserRow[]>([]);
  const [cashTop, setCashTop] = useState<TeaserRow[]>([]);
  const dots = useMemo(() => particles(14), []);

  useEffect(() => {
    void fetch("/api/sessions/upcoming")
      .then((r) => r.json())
      .then(setUpcoming)
      .catch(() => {});
    void fetch("/api/leaderboards/tournament")
      .then((r) => r.json())
      .then((rows: TeaserRow[]) => setTournamentTop(rows.slice(0, 3)))
      .catch(() => {});
    void fetch("/api/leaderboards/cash")
      .then((r) => r.json())
      .then((rows: TeaserRow[]) => setCashTop(rows.slice(0, 3)))
      .catch(() => {});
  }, []);

  const next = upcoming[0];

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {dots.map((p, i) => (
            <span
              key={i}
              className="ember-particle"
              style={{
                left: p.left,
                bottom: "-4vh",
                width: p.size,
                height: p.size,
                animationDuration: `${p.duration}s`,
                animationDelay: `${p.delay}s`,
              }}
            />
          ))}
        </div>

        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pb-20 pt-24 text-center sm:pt-32">
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <SpadeGlyph size={200} className="h-40 w-40 sm:h-52 sm:w-52" />
          </motion.div>
          <motion.h1
            className="mt-6 font-display text-4xl font-bold tracking-[0.14em] sm:text-6xl"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            UOS <span className="text-ember">POKER</span>
          </motion.h1>
          <motion.p
            className="mt-4 max-w-xl text-lg text-muted"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            Sheffield's student card room. Real tables on campus twice a week — and an online
            room that never closes.
          </motion.p>

          {next && (
            <motion.div
              className="mt-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
            >
              <p className="mb-3 font-display text-xs uppercase tracking-[0.3em] text-muted">
                Next session — {next.type === "TOURNAMENT" ? "Tournament" : "Cash game"} ·{" "}
                {new Date(next.date).toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
              <Countdown to={new Date(next.date)} />
            </motion.div>
          )}

          <motion.div
            className="mt-10 flex flex-wrap justify-center gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
          >
            <EmberLink to="/play">Play online</EmberLink>
            <GhostLink to="/leaderboards">Leaderboards</GhostLink>
            <GhostLink to="/learn">Learn poker</GhostLink>
          </motion.div>
        </div>
        <div className="ember-rail" />
      </section>

      {/* ------------------------------------------------------------- society */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <Reveal>
          <SectionTitle kicker="The society">{SOCIETY.blurb}</SectionTitle>
          <p className="mt-3 max-w-2xl text-muted">
            We're the University of Sheffield's poker society — beginners welcome, sharks
            tolerated. {SOCIETY.sessionTimes} at {SOCIETY.venueName}.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Reveal>
            <div className="panel-steel h-full rounded-lg p-6">
              <p className="font-display text-xs uppercase tracking-[0.3em] text-ember">
                Tuesdays
              </p>
              <h3 className="mt-2 font-display text-xl font-semibold">The Tournament</h3>
              <p className="mt-2 text-sm text-muted">
                One buy-in of chips, blinds that climb, and a points ladder that runs all
                season. Outlast the room and the leaderboard remembers. Finish anywhere and
                you still bank a point for showing up.
              </p>
              <Link to="/sessions" className="mt-4 inline-block text-sm text-ember underline">
                How Tuesday works
              </Link>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="panel-steel h-full rounded-lg p-6">
              <p className="font-display text-xs uppercase tracking-[0.3em] text-ember">
                Thursdays
              </p>
              <h3 className="mt-2 font-display text-xl font-semibold">The Cash Game</h3>
              <p className="mt-2 text-sm text-muted">
                Sit when you like, leave when you like, rebuy when it hurts. Your net result
                each night feeds the season's cash board. Play-money chips — pride is the
                only currency.
              </p>
              <Link to="/sessions" className="mt-4 inline-block text-sm text-ember underline">
                How Thursday works
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------------------------------------- leaderboard teasers */}
      {(tournamentTop.length > 0 || cashTop.length > 0) && (
        <section className="border-t border-line bg-bg-1">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <Reveal>
              <SectionTitle kicker="This season">Who's running the room</SectionTitle>
            </Reveal>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {[
                { title: "Tournament points", rows: tournamentTop, kind: "points" as const },
                { title: "Cash net", rows: cashTop, kind: "net" as const },
              ].map(({ title, rows, kind }) => (
                <Reveal key={title}>
                  <div className="panel-steel rounded-lg p-5">
                    <h3 className="font-display text-sm uppercase tracking-widest text-muted">
                      {title}
                    </h3>
                    <ol className="mt-3 space-y-2">
                      {rows.map((row) => (
                        <li key={row.rank} className="flex items-baseline justify-between">
                          <span
                            className={`font-display ${row.rank === 1 ? "text-gold" : "text-text"}`}
                          >
                            <span className="tnum mr-3">{row.rank}</span>
                            {row.nickname}
                          </span>
                          <span className="tnum text-sm text-muted">
                            {kind === "points"
                              ? `${row.points} pts`
                              : `${(row.net ?? 0) >= 0 ? "+" : ""}${(row.net ?? 0).toLocaleString()}`}
                          </span>
                        </li>
                      ))}
                      {rows.length === 0 && (
                        <li className="text-sm text-muted">
                          No results yet — the season's wide open.
                        </li>
                      )}
                    </ol>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* --------------------------------------------------------------- learn strip */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <Reveal>
          <div className="panel-steel flex flex-col items-start gap-4 rounded-lg p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-xl font-semibold">Never played a hand?</h3>
              <p className="mt-1 text-sm text-muted">
                Five short chapters take you from "what's a flop?" to sitting down with a
                plan. No jargon walls, no homework.
              </p>
            </div>
            <EmberLink to="/learn">Start at chapter one</EmberLink>
          </div>
        </Reveal>
      </section>
    </>
  );
}
