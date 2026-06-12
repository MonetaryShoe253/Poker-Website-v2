import type { BotPersonality } from "@uos-poker/engine";

/** Themed bot names per personality. Bots are always badged as bots. */
const NAME_POOLS: Record<BotPersonality, string[]> = {
  STANDARD: [
    "Ledger",
    "Gauge",
    "Pivot",
    "Tracer",
    "Vector",
    "Datum",
    "Caliper",
    "Spindle",
  ],
  ROCK: ["Granite", "Basalt", "Bedrock", "Flint", "Slate", "Quartz"],
  MANIAC: ["Sparks", "Tilt", "Backdraft", "Jolt", "Fuse", "Scattergun"],
  STATION: ["Anchor", "Lighthouse", "Moor", "Berth", "Jetty", "Breakwater"],
};

export function pickBotName(
  personality: BotPersonality,
  inUse: Set<string>,
  random: () => number,
): string {
  const pool = NAME_POOLS[personality].filter((n) => !inUse.has(n));
  if (pool.length > 0) return pool[Math.floor(random() * pool.length)]!;
  // Pool exhausted: suffix a number.
  const base = NAME_POOLS[personality][0]!;
  let i = 2;
  while (inUse.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
