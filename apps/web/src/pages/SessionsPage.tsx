import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Reveal, SectionTitle } from "../components/ui";
import { usePageMeta } from "../lib/usePageMeta";
import { SOCIETY } from "../content/society";

interface UpcomingSession {
  id: string;
  type: "TOURNAMENT" | "CASH";
  date: string;
}

export function SessionsPage() {
  usePageMeta(
    "Sessions",
    "Tuesday tournaments and Thursday cash games, 17:00–20:00 — what to expect at your first UOS Poker session.",
  );
  const [upcoming, setUpcoming] = useState<UpcomingSession[]>([]);
  useEffect(() => {
    void fetch("/api/sessions/upcoming")
      .then((r) => r.json())
      .then(setUpcoming)
      .catch(() => {});
  }, []);

  return (
    <section className="mx-auto max-w-6xl px-4 py-14">
      <Reveal>
        <SectionTitle kicker="Weekly sessions">Two nights, two games</SectionTitle>
        <p className="mt-3 max-w-2xl text-muted">
          {SOCIETY.sessionTimes} at {SOCIETY.venueName}, {SOCIETY.venueAddress}. Turn up any
          week — no sign-up needed beyond SU membership, and your first visit can just be a
          look around.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Reveal>
          <article className="panel-steel h-full rounded-lg p-6">
            <p className="font-display text-xs uppercase tracking-[0.3em] text-ember">
              Tuesday · 17:00–20:00
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold">The Tournament</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-display text-muted">Format</dt>
                <dd className="text-text">
                  Freezeout No-Limit Hold'em. Everyone starts on the same stack; blinds rise
                  every 15–20 minutes; lose your chips and you're done for the night.
                </dd>
              </div>
              <div>
                <dt className="font-display text-muted">What it costs</dt>
                <dd className="text-text">
                  Nothing beyond membership — chips are play-money. The prize is points.
                </dd>
              </div>
              <div>
                <dt className="font-display text-muted">Points</dt>
                <dd className="text-text">
                  1st&nbsp;10 · 2nd&nbsp;7 · 3rd&nbsp;5 · 4th&nbsp;3 · 5th&nbsp;2 — and a
                  point for everyone else who played. They add up all season on the{" "}
                  <Link to="/leaderboards" className="text-ember underline">
                    Tuesday board
                  </Link>
                  .
                </dd>
              </div>
            </dl>
          </article>
        </Reveal>

        <Reveal delay={0.1}>
          <article className="panel-steel h-full rounded-lg p-6">
            <p className="font-display text-xs uppercase tracking-[0.3em] text-ember">
              Thursday · 17:00–20:00
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold">The Cash Game</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-display text-muted">Format</dt>
                <dd className="text-text">
                  Ring-game Hold'em with play-money chips. Buy in for a stack, top up if it
                  goes badly, rack up when you leave. Come for twenty minutes or all three
                  hours.
                </dd>
              </div>
              <div>
                <dt className="font-display text-muted">The score</dt>
                <dd className="text-text">
                  Your net for the night — cash-out minus buy-ins — goes on the{" "}
                  <Link to="/leaderboards" className="text-ember underline">
                    Thursday board
                  </Link>
                  . Season totals decide bragging rights.
                </dd>
              </div>
              <div>
                <dt className="font-display text-muted">Pace</dt>
                <dd className="text-text">
                  Friendlier than it sounds. Table talk is half the game on Thursdays.
                </dd>
              </div>
            </dl>
          </article>
        </Reveal>
      </div>

      {/* The ritual */}
      <div className="mt-10">
        <Reveal>
          <div className="panel-steel rounded-lg p-6">
            <SectionTitle kicker="The ritual">How results get on the boards</SectionTitle>
            <ol className="mt-4 max-w-2xl list-decimal space-y-2 pl-5 text-sm text-muted">
              <li>
                At each session, whoever's running the night announces a{" "}
                <span className="font-mono text-text">6-character code</span> in the room.
              </li>
              <li>
                Before midnight, open{" "}
                <Link to="/submit" className="text-ember underline">
                  Submit result
                </Link>{" "}
                on your phone, enter the code and your result.
              </li>
              <li>
                It lands on the leaderboard instantly. One submission per person per session —
                the committee can fix mistakes.
              </li>
            </ol>
          </div>
        </Reveal>
      </div>

      {/* What to bring / expect */}
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Reveal>
          <div className="panel-steel h-full rounded-lg p-6">
            <h3 className="font-display text-lg font-semibold">First time? Bring…</h3>
            <ul className="mt-3 space-y-1.5 text-sm text-muted">
              <li>— Yourself. Chips, cards and tables are handled.</li>
              <li>— Your U-Card (room access in the Diamond).</li>
              <li>— Zero poker knowledge required: read
                {" "}<Link to="/learn" className="text-ember underline">the beginner course</Link>{" "}
                on the bus there and you'll be fine.</li>
            </ul>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="panel-steel h-full rounded-lg p-6">
            <h3 className="font-display text-lg font-semibold">Upcoming dates</h3>
            <ul className="mt-3 space-y-1.5 text-sm">
              {upcoming.map((s) => (
                <li key={s.id} className="flex justify-between">
                  <span className="text-text">
                    {new Date(s.date).toLocaleDateString("en-GB", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </span>
                  <span className="font-display text-xs uppercase tracking-widest text-muted">
                    {s.type === "TOURNAMENT" ? "Tournament" : "Cash"}
                  </span>
                </li>
              ))}
              {upcoming.length === 0 && (
                <li className="text-muted">Dates TBA — term schedule lands soon.</li>
              )}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
