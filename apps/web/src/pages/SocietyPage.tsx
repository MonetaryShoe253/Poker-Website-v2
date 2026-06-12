import { Reveal, SectionTitle } from "../components/ui";
import { usePageMeta } from "../lib/usePageMeta";
import { SOCIETY } from "../content/society";

export function SocietyPage() {
  usePageMeta(
    "The Society",
    "Who we are, where we play, and how to join the University of Sheffield Poker Society.",
  );

  return (
    <section className="mx-auto max-w-6xl px-4 py-14">
      <Reveal>
        <SectionTitle kicker="The society">Built around a table</SectionTitle>
        <p className="mt-4 max-w-2xl text-muted">{SOCIETY.blurb}</p>
        <p className="mt-2 max-w-2xl text-muted">
          Whether you've never touched a chip or you've got a hoodie-and-sunglasses phase
          behind you, there's a seat. We run {SOCIETY.sessionTimes.toLowerCase()} — every week
          of term.
        </p>
      </Reveal>

      {/* Committee */}
      <div className="mt-14">
        <Reveal>
          <SectionTitle kicker="Committee">The people running the room</SectionTitle>
        </Reveal>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SOCIETY.committee.map((member, i) => (
            <Reveal key={member.name + member.role} delay={Math.min(i * 0.04, 0.3)}>
              <div className="panel-steel rounded-lg p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-steel bg-bg-0 font-display text-sm text-ember">
                  {member.name.charAt(0)}
                </div>
                <p className="mt-3 font-display text-base">{member.name}</p>
                <p className="text-xs uppercase tracking-widest text-muted">{member.role}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Venue */}
      <div className="mt-14 grid gap-6 md:grid-cols-2">
        <Reveal>
          <div>
            <SectionTitle kicker="The venue">{SOCIETY.venueName}</SectionTitle>
            <p className="mt-3 text-muted">{SOCIETY.venueAddress}</p>
            <p className="mt-2 text-sm text-muted">
              Sessions run in bookable rooms inside the Diamond — check the society Instagram
              for the room number each week.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={SOCIETY.membershipUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded bg-ember-deep px-5 py-2.5 font-display text-sm tracking-wide text-white hover:bg-ember"
              >
                Join via the SU
              </a>
              <a
                href={SOCIETY.instagramUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-steel px-5 py-2.5 font-display text-sm tracking-wide hover:border-ember hover:text-ember"
              >
                Instagram
              </a>
            </div>
            <p className="mt-6 text-sm text-muted">
              Questions?{" "}
              {SOCIETY.contactEmail ? (
                <a href={`mailto:${SOCIETY.contactEmail}`} className="text-ember underline">
                  {SOCIETY.contactEmail}
                </a>
              ) : (
                <span>
                  Contact email <span className="font-display text-muted">TBA</span> — DM the
                  Instagram for now.
                </span>
              )}
            </p>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="panel-steel overflow-hidden rounded-lg">
            <iframe
              title={`Map — ${SOCIETY.venueName}`}
              src={`https://www.google.com/maps?q=${encodeURIComponent(
                `${SOCIETY.venueName}, ${SOCIETY.venueAddress}`,
              )}&output=embed`}
              className="h-72 w-full grayscale-[0.6] contrast-[1.05]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </Reveal>
      </div>

      {/* Membership */}
      <div className="mt-14">
        <Reveal>
          <div className="panel-steel rounded-lg p-6">
            <SectionTitle kicker="Membership">How to join</SectionTitle>
            <ol className="mt-4 max-w-2xl list-decimal space-y-2 pl-5 text-sm text-muted">
              <li>
                Grab membership through the{" "}
                <a
                  href={SOCIETY.membershipUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ember underline"
                >
                  Students' Union page
                </a>
                .
              </li>
              <li>Turn up on a Tuesday or Thursday — your first night, just watch if you like.</li>
              <li>
                Make an account here to play online and get on the leaderboards. Everything on
                this site is play-money — no real-money gambling, ever.
              </li>
            </ol>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
