import { Link } from "react-router";
import { PlayingCard } from "../components/PlayingCard";
import { usePageMeta } from "../lib/usePageMeta";

/** 404 — a dead hand. Seven-deuce offsuit, naturally. */
export function NotFoundPage() {
  usePageMeta("Page not found");
  return (
    <section className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <div className="flex gap-2">
        <span className="-rotate-6">
          <PlayingCard card="7c" />
        </span>
        <span className="rotate-6">
          <PlayingCard card="2d" />
        </span>
      </div>
      <h1 className="mt-6 font-display text-4xl font-bold tracking-[0.14em]">
        4<span className="text-ember">0</span>4
      </h1>
      <p className="mt-3 text-muted">
        Dead hand. This page folded before the flop — check the address, or head back and
        play something better.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          to="/"
          className="rounded bg-ember-deep px-5 py-2.5 font-display text-sm tracking-wide text-white hover:bg-ember"
        >
          Back to the room
        </Link>
        <Link
          to="/play"
          className="rounded border border-steel px-5 py-2.5 font-display text-sm tracking-wide hover:border-ember hover:text-ember"
        >
          The lobby
        </Link>
      </div>
    </section>
  );
}
