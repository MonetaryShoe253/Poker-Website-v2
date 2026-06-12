const SUIT_GLYPHS: Record<string, string> = { c: "♣", d: "♦", h: "♥", s: "♠" };

/** Two-colour by default; four-colour deck arrives with the settings work in P5. */
const SUIT_COLOURS: Record<string, string> = {
  c: "text-text",
  s: "text-text",
  d: "text-ember",
  h: "text-ember",
};

export function PlayingCard({
  card,
  faceDown = false,
  dimmed = false,
  glow = false,
  size = "md",
}: {
  card?: string;
  faceDown?: boolean;
  dimmed?: boolean;
  glow?: boolean;
  size?: "sm" | "md";
}) {
  const sizes = size === "sm" ? "h-10 w-7 text-xs" : "h-14 w-10 text-base";
  if (faceDown || !card) {
    return (
      <span
        className={`${sizes} inline-flex items-center justify-center rounded border border-steel bg-gradient-to-b from-bg-2 to-bg-1`}
        aria-hidden="true"
      >
        <span className="text-muted/40 text-lg">◆</span>
      </span>
    );
  }
  const rank = card[0] === "T" ? "10" : card[0];
  const suit = card[1] ?? "";
  return (
    <span
      className={`${sizes} inline-flex flex-col items-center justify-center rounded border bg-[#E9ECF0] font-display font-semibold leading-none ${
        glow ? "border-ember shadow-ember" : "border-steel"
      } ${dimmed ? "opacity-40" : ""}`}
      aria-label={card}
    >
      <span className={suit === "d" || suit === "h" ? "text-ember-deep" : "text-bg-0"}>{rank}</span>
      <span className={suit === "d" || suit === "h" ? "text-ember-deep" : "text-bg-0"}>
        {SUIT_GLYPHS[suit] ?? "?"}
      </span>
    </span>
  );
}

export const suitColour = SUIT_COLOURS;
