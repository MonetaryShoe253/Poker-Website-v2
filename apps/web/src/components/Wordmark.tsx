/**
 * The UOS POKER mark: the society's Logo.png. Used in nav, the home hero, and
 * anywhere the brand glyph appears. Keeps the `size` prop the old spade glyph
 * exposed so existing call sites need no changes.
 */
export function SpadeGlyph({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/Logo.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={`shrink-0 object-contain ${className}`}
    />
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2 select-none">
      <SpadeGlyph size={40} />
      <span className="font-display text-xl font-semibold tracking-[0.18em] text-text">
        UOS<span className="text-ember">&nbsp;POKER</span>
      </span>
    </span>
  );
}
