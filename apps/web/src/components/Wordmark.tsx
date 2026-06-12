/**
 * The UOS POKER wordmark: machined spade glyph whose inner edge picks up the
 * ember, plus the display-face wordmark. Pure SVG — used in nav, OG cards,
 * and emails. Trivially replaced if the society ever supplies a real logo.
 */
export function SpadeGlyph({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="spade-steel" x1="16" y1="2" x2="16" y2="30">
          <stop offset="0" stopColor="#3a414b" />
          <stop offset="0.5" stopColor="#23272d" />
          <stop offset="1" stopColor="#15181c" />
        </linearGradient>
      </defs>
      {/* Machined spade body */}
      <path
        d="M16 2.5C12 8.5 4.5 13 4.5 19.2c0 3.6 2.8 6.3 6.2 6.3 2 0 3.7-.9 4.8-2.3-.4 2.5-1.4 4.4-3 5.8h7c-1.6-1.4-2.6-3.3-3-5.8 1.1 1.4 2.8 2.3 4.8 2.3 3.4 0 6.2-2.7 6.2-6.3C27.5 13 20 8.5 16 2.5Z"
        fill="url(#spade-steel)"
        stroke="#454c56"
        strokeWidth="1"
      />
      {/* Ember inner edge */}
      <path
        d="M16 6.8c-3 4.3-8 7.9-8 12.4 0 2.4 1.8 4.2 4.1 4.2 1.9 0 3.3-1.1 3.9-2.8.6 1.7 2 2.8 3.9 2.8 2.3 0 4.1-1.8 4.1-4.2 0-4.5-5-8.1-8-12.4Z"
        fill="none"
        stroke="#FF2D40"
        strokeWidth="1.2"
        opacity="0.9"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2 select-none">
      <SpadeGlyph />
      <span className="font-display text-lg font-semibold tracking-[0.18em] text-text">
        UOS<span className="text-ember">&nbsp;POKER</span>
      </span>
    </span>
  );
}
