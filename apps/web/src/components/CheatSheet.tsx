import { PlayingCard } from "./PlayingCard";

/**
 * Hand rankings, best to worst, drawn with the site's own card components.
 * Rendered inline on Learn and as a one-tap overlay at the table.
 */

const RANKINGS: Array<{ name: string; cards: string[]; note: string }> = [
  { name: "Royal flush", cards: ["As", "Ks", "Qs", "Js", "Ts"], note: "Ace-high straight flush. The one you'll tell people about." },
  { name: "Straight flush", cards: ["9h", "8h", "7h", "6h", "5h"], note: "Five in a row, one suit." },
  { name: "Four of a kind", cards: ["Qc", "Qd", "Qh", "Qs", "2c"], note: "All four of a rank." },
  { name: "Full house", cards: ["Kc", "Kd", "Kh", "9s", "9c"], note: "Three of one rank, two of another." },
  { name: "Flush", cards: ["Ad", "Jd", "8d", "6d", "3d"], note: "Five of one suit, any order." },
  { name: "Straight", cards: ["Tc", "9d", "8h", "7s", "6c"], note: "Five in a row, suits don't matter." },
  { name: "Three of a kind", cards: ["7c", "7d", "7h", "Ks", "2c"], note: "Three of a rank." },
  { name: "Two pair", cards: ["Ac", "Ad", "8h", "8s", "3c"], note: "Two ranks, paired." },
  { name: "Pair", cards: ["Jc", "Jd", "Ah", "7s", "2c"], note: "One rank, paired." },
  { name: "High card", cards: ["Ac", "Qd", "9h", "5s", "3c"], note: "None of the above — best single card plays." },
];

export function CheatSheet({ compact = false }: { compact?: boolean }) {
  return (
    <ol className={compact ? "space-y-2" : "space-y-3"}>
      {RANKINGS.map((hand, i) => (
        <li
          key={hand.name}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/50 pb-2"
        >
          <span className="tnum w-5 text-right font-display text-sm text-muted">{i + 1}</span>
          <span className="flex gap-1">
            {hand.cards.map((c) => (
              <PlayingCard key={c} card={c} size="sm" />
            ))}
          </span>
          <span className="font-display text-sm text-text">{hand.name}</span>
          {!compact && <span className="basis-full pl-8 text-xs text-muted sm:basis-auto sm:pl-0">{hand.note}</span>}
        </li>
      ))}
    </ol>
  );
}

export function CheatSheetOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-0/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Hand rankings"
      onClick={onClose}
    >
      <div
        className="panel-steel max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-wide">Hand rankings</h2>
          <button
            onClick={onClose}
            className="rounded border border-steel px-3 py-1 text-sm text-muted hover:border-ember hover:text-ember"
          >
            Close
          </button>
        </div>
        <CheatSheet compact />
      </div>
    </div>
  );
}
