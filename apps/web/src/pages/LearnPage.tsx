import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router";
import { PlayingCard } from "../components/PlayingCard";
import { CheatSheet } from "../components/CheatSheet";
import { Reveal, SectionTitle } from "../components/ui";
import { usePageMeta } from "../lib/usePageMeta";

/**
 * The beginner course: five short chapters, progress dots, and a dealt
 * sample hand you can step through. Total beginner → can sit down and play.
 */

const CHAPTERS = [
  "The game",
  "Hand rankings",
  "Betting",
  "Position & starting hands",
  "Etiquette",
] as const;

// ---------------------------------------------------------------------------
// Chapter 1's interactive moment: a scripted hand, stepped through.
// ---------------------------------------------------------------------------

const SAMPLE_STEPS = [
  {
    board: [] as string[],
    you: ["Ah", "Kh"],
    caption:
      "You're dealt two private cards — your hole cards. Ace-king of hearts: a strong start.",
  },
  {
    board: ["Qh", "7c", "2h"],
    you: ["Ah", "Kh"],
    caption:
      "The flop: three shared cards everyone can use. You have two hearts in hand, two on the board — two more chances to hit a flush.",
  },
  {
    board: ["Qh", "7c", "2h", "9d"],
    you: ["Ah", "Kh"],
    caption: "The turn: a fourth shared card. The 9♦ misses you. Still just ace-high.",
  },
  {
    board: ["Qh", "7c", "2h", "9d", "4h"],
    you: ["Ah", "Kh"],
    caption:
      "The river: the 4♥ completes your flush — five hearts using your two and the board's three. That's a strong hand: bet it.",
  },
];

function SampleHand() {
  const [step, setStep] = useState(0);
  const current = SAMPLE_STEPS[step]!;
  return (
    <div className="felt-weave rounded-lg border border-steel bg-felt p-5">
      <p className="font-display text-xs uppercase tracking-[0.3em] text-muted">
        Deal a sample hand
      </p>
      <div className="mt-4 flex min-h-16 items-center justify-center gap-1.5">
        <AnimatePresence>
          {current.board.map((card) => (
            <motion.span
              key={card}
              initial={{ opacity: 0, y: -10, rotateY: 80 }}
              animate={{ opacity: 1, y: 0, rotateY: 0 }}
              transition={{ duration: 0.35 }}
            >
              <PlayingCard card={card} />
            </motion.span>
          ))}
        </AnimatePresence>
        {current.board.length === 0 && (
          <span className="text-sm text-muted">The board starts empty…</span>
        )}
      </div>
      <div className="mt-4 flex items-center justify-center gap-1.5">
        <span className="mr-2 text-xs uppercase tracking-widest text-muted">Your cards</span>
        {current.you.map((card) => (
          <PlayingCard key={card} card={card} size="sm" />
        ))}
      </div>
      <p className="mx-auto mt-4 max-w-md text-center text-sm text-muted">{current.caption}</p>
      <div className="mt-4 flex justify-center gap-2">
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="rounded border border-steel px-4 py-1.5 font-display text-sm disabled:opacity-30"
        >
          Back
        </button>
        <button
          onClick={() => setStep(Math.min(SAMPLE_STEPS.length - 1, step + 1))}
          disabled={step === SAMPLE_STEPS.length - 1}
          className="rounded bg-ember-deep px-4 py-1.5 font-display text-sm text-white hover:bg-ember disabled:opacity-30"
        >
          {step === 0 ? "Deal the flop" : step === 1 ? "Deal the turn" : "Deal the river"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Chapter({ index, active, children }: { index: number; active: number; children: React.ReactNode }) {
  if (index !== active) return null;
  return (
    <motion.div
      key={index}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-5"
    >
      {children}
    </motion.div>
  );
}

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="max-w-2xl text-[15px] leading-relaxed text-muted">{children}</p>
);
const H = ({ children }: { children: React.ReactNode }) => (
  <h3 className="font-display text-lg font-semibold text-text">{children}</h3>
);
const Term = ({ children }: { children: React.ReactNode }) => (
  <span className="text-text">{children}</span>
);

export function LearnPage() {
  usePageMeta(
    "Learn poker",
    "A five-chapter beginner course: the flow of a hand, hand rankings, betting, position, and table etiquette.",
  );
  const [chapter, setChapter] = useState(0);

  return (
    <section className="mx-auto max-w-4xl px-4 py-12">
      <Reveal>
        <SectionTitle kicker="Learn poker">From zero to dealt in</SectionTitle>
        <p className="mt-2 max-w-2xl text-muted">
          Five short chapters. Read them in order, or jump around. By the end you can sit down
          on a Tuesday — or at an online table — and know exactly what's happening.
        </p>
      </Reveal>

      {/* Progress dots */}
      <nav aria-label="Chapters" className="mt-8 flex flex-wrap items-center gap-2">
        {CHAPTERS.map((title, i) => (
          <button
            key={title}
            onClick={() => setChapter(i)}
            aria-current={chapter === i}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-display tracking-wide transition-colors ${
              chapter === i
                ? "border-ember text-ember shadow-ember"
                : i < chapter
                  ? "border-steel text-text"
                  : "border-steel text-muted hover:text-text"
            }`}
          >
            <span className="tnum">{i + 1}</span> {title}
          </button>
        ))}
      </nav>

      <div className="panel-steel mt-6 rounded-lg p-6 sm:p-8">
        {/* ---------------------------------------------- Ch 1: the game */}
        <Chapter index={0} active={chapter}>
          <H>Poker in one paragraph</H>
          <P>
            Texas Hold'em deals everyone <Term>two private cards</Term>, then turns up{" "}
            <Term>five shared cards</Term> in the middle. You make the best five-card hand from
            any combination of your two and the board's five. Between each reveal there's a
            round of betting — and that's where the game actually lives, because you don't
            have to show your cards to win. If everyone else folds, the pot's yours.
          </P>
          <H>The flow of a hand</H>
          <P>
            <Term>Blinds</Term> (two forced bets) seed the pot. Cards are dealt, then betting:{" "}
            <Term>pre-flop</Term> → the <Term>flop</Term> (three cards) → the <Term>turn</Term>{" "}
            (one more) → the <Term>river</Term> (the last one) → <Term>showdown</Term>, where
            remaining players reveal and the best hand takes the pot.
          </P>
          <SampleHand />
        </Chapter>

        {/* ---------------------------------------------- Ch 2: rankings */}
        <Chapter index={1} active={chapter}>
          <H>What beats what</H>
          <P>
            Memorise the ladder below — it's the same in every poker game on earth. Rarer beats
            commoner. When two players have the same type of hand, the higher cards inside it
            win (a king-high flush beats a nine-high flush).
          </P>
          <CheatSheet />
          <P>
            This list lives one tap away during online play, so don't worry about exams. After
            a few sessions you'll stop looking.
          </P>
        </Chapter>

        {/* ---------------------------------------------- Ch 3: betting */}
        <Chapter index={2} active={chapter}>
          <H>Your five buttons</H>
          <P>
            When it's your turn you can <Term>check</Term> (pass, if nobody has bet),{" "}
            <Term>bet</Term> (put chips in), <Term>call</Term> (match the current bet),{" "}
            <Term>raise</Term> (match it and add more), or <Term>fold</Term> (throw your hand
            away and sit out the rest of the hand). That's the whole interface.
          </P>
          <H>Pot odds, in plain English</H>
          <P>
            Every call is a price. If the pot is 900 and someone bets 100, you're paying 100 to
            win 1,000 — ten-to-one. Even a long-shot draw is worth that. If the pot is 200 and
            the bet is 400, you're paying 400 to win 600 — now you need a strong hand or a
            great draw. You don't need maths at the table; just ask{" "}
            <Term>"is this cheap or expensive for what I'm holding?"</Term>
          </P>
          <H>One rule that saves beginners</H>
          <P>
            Fold more than feels polite. Most hands you're dealt are losers, and folding them
            costs nothing. The players who lose fastest are the ones who call "just to see."
          </P>
        </Chapter>

        {/* ---------------------------------------------- Ch 4: position */}
        <Chapter index={3} active={chapter}>
          <H>Why the dealer button matters</H>
          <P>
            Betting goes clockwise, so the player on the <Term>button</Term> (the dealer
            position) acts <Term>last</Term> after the flop — they've seen what everyone else
            did before deciding. Acting last is a genuine advantage, every single hand. The
            button moves one seat each hand so everyone gets their turn.
          </P>
          <H>Starting hands: a beginner's map</H>
          <P>
            <Term>Play from any seat:</Term> big pairs (AA–99) and big cards (AK, AQ, KQ).{" "}
            <Term>Play late, near the button:</Term> medium pairs, suited connectors like 9♠8♠,
            ace-with-anything suited. <Term>Fold almost everywhere:</Term> the random junk —
            J3, 92, Q4 — that makes up most of what you're dealt. When in doubt early in the
            night: tight from early seats, braver on the button.
          </P>
          <div className="flex flex-wrap items-center gap-4 rounded border border-line p-4">
            <div className="flex items-center gap-1.5">
              <PlayingCard card="As" size="sm" />
              <PlayingCard card="Ad" size="sm" />
              <span className="ml-1 text-xs text-green-400">always</span>
            </div>
            <div className="flex items-center gap-1.5">
              <PlayingCard card="9s" size="sm" />
              <PlayingCard card="8s" size="sm" />
              <span className="ml-1 text-xs text-gold">late seats</span>
            </div>
            <div className="flex items-center gap-1.5">
              <PlayingCard card="Jd" size="sm" />
              <PlayingCard card="3c" size="sm" />
              <span className="ml-1 text-xs text-ember">never</span>
            </div>
          </div>
        </Chapter>

        {/* ---------------------------------------------- Ch 5: etiquette */}
        <Chapter index={4} active={chapter}>
          <H>At the society (in person)</H>
          <P>
            Act in turn — wait for the player on your right. Keep your cards on the table and
            your big reactions for after the hand. Don't comment on a hand you've folded out
            of ("I folded a king!" changes the game for the people still in it). Stack your
            chips so others can see roughly what you have. And be kind to beginners; everyone
            at the table was one.
          </P>
          <H>Online, here</H>
          <P>
            The clock is 20 seconds with a spare time bank — act promptly and nobody waits.
            Chat is for table talk, not abuse; the filter is robust and the committee can mute.
            Don't discuss live hands in chat while others are still acting. Losing hands muck
            automatically, so nobody sees your bluffs unless you choose to show.
          </P>
          <H>The golden rule</H>
          <P>
            It's a game between friends, played for plastic chips and glory. Win graciously,
            lose loudly only about the cards, never about people.
          </P>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link
              to="/play"
              className="rounded bg-ember-deep px-5 py-2.5 font-display text-sm tracking-wide text-white shadow-ember hover:bg-ember"
            >
              You're ready — deal me in
            </Link>
            <Link
              to="/sessions"
              className="rounded border border-steel px-5 py-2.5 font-display text-sm tracking-wide hover:border-ember hover:text-ember"
            >
              Come on a Tuesday
            </Link>
          </div>
        </Chapter>

        {/* Prev/next */}
        <div className="mt-8 flex justify-between border-t border-line pt-4">
          <button
            onClick={() => setChapter(Math.max(0, chapter - 1))}
            disabled={chapter === 0}
            className="rounded border border-steel px-4 py-2 font-display text-sm disabled:opacity-30"
          >
            ← {chapter > 0 ? CHAPTERS[chapter - 1] : ""}
          </button>
          <button
            onClick={() => setChapter(Math.min(CHAPTERS.length - 1, chapter + 1))}
            disabled={chapter === CHAPTERS.length - 1}
            className="rounded border border-steel px-4 py-2 font-display text-sm hover:border-ember hover:text-ember disabled:opacity-30"
          >
            {chapter < CHAPTERS.length - 1 ? CHAPTERS[chapter + 1] : ""} →
          </button>
        </div>
      </div>
    </section>
  );
}
