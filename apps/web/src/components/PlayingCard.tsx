const SUIT_GLYPHS: Record<string, string> = { c: "♣", d: "♦", h: "♥", s: "♠" };

/** Two-colour by default; four-colour deck: clubs green, diamonds blue. */
function suitStyle(suit: string, fourColour: boolean): string {
  if (fourColour) {
    switch (suit) {
      case "c":
        return "#15803D";
      case "d":
        return "#1D4ED8";
      case "h":
        return "#C8102E";
      default:
        return "#0A0B0D";
    }
  }
  return suit === "d" || suit === "h" ? "#C8102E" : "#0A0B0D";
}

export function PlayingCard({
  card,
  faceDown = false,
  dimmed = false,
  glow = false,
  size = "md",
  fourColour = false,
  flipIn = false,
}: {
  card?: string;
  faceDown?: boolean;
  dimmed?: boolean;
  glow?: boolean;
  size?: "sm" | "md";
  fourColour?: boolean;
  flipIn?: boolean;
}) {
  const sizes = size === "sm" ? "h-10 w-7 text-xs" : "h-14 w-10 text-base";
  if (faceDown || !card) {
    return (
      <span
        className={`${sizes} inline-flex items-center justify-center rounded border border-steel bg-gradient-to-b from-bg-2 to-bg-1`}
        aria-hidden="true"
      >
        <span className="text-lg text-muted/40">◆</span>
      </span>
    );
  }
  const rank = card[0] === "T" ? "10" : card[0];
  const suit = card[1] ?? "";
  const colour = suitStyle(suit, fourColour);
  return (
    <span
      className={`${sizes} inline-flex flex-col items-center justify-center rounded border bg-[#E9ECF0] font-display font-semibold leading-none transition-opacity duration-300 ${
        glow ? "border-ember shadow-ember" : "border-steel"
      } ${dimmed ? "opacity-40" : ""} ${flipIn ? "card-flip-in" : ""}`}
      aria-label={card}
    >
      <span style={{ color: colour }}>{rank}</span>
      <span style={{ color: colour }}>{SUIT_GLYPHS[suit] ?? "?"}</span>
    </span>
  );
}
