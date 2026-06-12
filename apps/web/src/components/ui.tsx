import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Link } from "react-router";

/** Shared STEEL/EMBER primitives — keep every page in one voice. */

export function EmberLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-block rounded bg-ember-deep px-6 py-3 font-display tracking-wide text-white shadow-ember transition-colors hover:bg-ember"
    >
      {children}
    </Link>
  );
}

export function GhostLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-block rounded border border-steel px-6 py-3 font-display tracking-wide text-text transition-colors hover:border-ember hover:text-ember"
    >
      {children}
    </Link>
  );
}

export function SectionTitle({ kicker, children }: { kicker?: string; children: ReactNode }) {
  return (
    <div>
      {kicker && (
        <p className="font-display text-xs uppercase tracking-[0.3em] text-ember">{kicker}</p>
      )}
      <h2 className="mt-1 font-display text-2xl font-semibold tracking-[0.08em] sm:text-3xl">
        {children}
      </h2>
    </div>
  );
}

export const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: "easeOut" },
} as const;

export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay }}>
      {children}
    </motion.div>
  );
}
