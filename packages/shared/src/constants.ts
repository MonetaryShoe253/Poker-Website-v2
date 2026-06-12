/**
 * Single source of truth for every tunable in the product.
 * Client and server both import from here — change values here only.
 */

export const TIMEZONE = "Europe/London";

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export const BLINDS = { small: 50, big: 100 } as const;

export const TABLE = {
  maxSeats: 6,
  minPlayersToDeal: 2,
} as const;

/** Chips, not money. 100bb standard buy-in at 50/100. */
export const BANKROLL = {
  starting: 25_000,
  dailyBonus: 5_000,
  tableBuyInMin: 4_000,
  tableBuyInDefault: 10_000,
  tableBuyInMax: 10_000,
} as const;

export const TIMERS = {
  /** Per-action clock. */
  actionMs: 20_000,
  /** One time bank per orbit, auto-engages when the action clock expires. */
  timeBankMs: 30_000,
  /** Extra grace on disconnect, on top of the remaining clock. */
  disconnectGraceMs: 10_000,
  /** Disconnected seat is held this long before stack returns to bankroll. */
  seatHoldMs: 120_000,
  /** Sat out this long → returned to lobby. */
  sitOutKickMs: 300_000,
  /** Consecutive timeouts before a player is sat out. */
  timeoutsBeforeSitOut: 2,
  /** Dramatic beat between all-in runout streets. */
  runoutBeatMs: 1_000,
  /** Humanised bot "thinking" delay range. */
  botDelayMinMs: 1_000,
  botDelayMaxMs: 4_000,
} as const;

// ---------------------------------------------------------------------------
// Lobby & scaling
// ---------------------------------------------------------------------------

export const SCALING = {
  /** Spawn a new public table when open human-available seats across all < this. */
  spawnWhenOpenSeatsBelow: 2,
  /** Despawn a public table after this long with zero humans (never the last one). */
  despawnAfterHumanlessMs: 300_000,
  /** Bots top public tables up to this many seated while any human is present. */
  minSeatedWithHuman: 3,
} as const;

export const TABLE_NAMES = [
  "The Forge",
  "Ember Room",
  "Crucible",
  "The Anvil",
  "Slag & Steel",
  "The Furnace",
  "Quenching Floor",
  "The Billet",
  "Night Shift",
  "The Foundry",
] as const;

// ---------------------------------------------------------------------------
// Elo
// ---------------------------------------------------------------------------

export const ELO = {
  start: 1000,
  /** K=24 for a player's first `provisionalHands` rated hands, then K=8. */
  kProvisional: 24,
  kStandard: 8,
  provisionalHands: 30,
  floor: 100,
  /** Minimum rated hands before appearing on the Elo leaderboard. */
  minHandsForBoard: 50,
} as const;

export type BotTier = "FISH" | "CASUAL" | "SOLID" | "SHARK";

export const BOT_TIERS: Record<
  BotTier,
  { elo: number; label: string; vpip: number; pfr: number }
> = {
  FISH: { elo: 800, label: "Fish", vpip: 0.55, pfr: 0.05 },
  CASUAL: { elo: 1000, label: "Casual", vpip: 0.35, pfr: 0.12 },
  SOLID: { elo: 1200, label: "Solid", vpip: 0.24, pfr: 0.18 },
  SHARK: { elo: 1400, label: "Shark", vpip: 0.22, pfr: 0.19 },
};

// ---------------------------------------------------------------------------
// In-person sessions & submissions
// ---------------------------------------------------------------------------

/** Unambiguous alphabet for session codes — no 0/O/1/I. */
export const SESSION_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const SESSION_CODE_LENGTH = 6;

/** Submission window on the session day, Europe/London. */
export const SUBMISSION_WINDOW = { openHour: 17, closeHour: 23, closeMinute: 59 } as const;

/** Default tournament points scheme; per-season copies are admin-editable. */
export const DEFAULT_POINTS_SCHEME = {
  positions: { 1: 10, 2: 7, 3: 5, 4: 3, 5: 2 } as Record<number, number>,
  participation: 1,
};

/** Cash submissions with |net| above this ask "looks big — sure?" (never block). */
export const CASH_NET_SOFT_LIMIT = 2_000;

// ---------------------------------------------------------------------------
// Identity & chat
// ---------------------------------------------------------------------------

export const NICKNAME = {
  min: 3,
  max: 16,
  pattern: /^[A-Za-z0-9_-]+$/,
} as const;

export const CHAT_RATE = { messages: 3, perMs: 4_000 } as const;

export const AVATAR_IDS = [
  "spade-ember",
  "chip-steel",
  "card-back",
  "anvil",
  "visor",
  "crown-muted",
  "diamond-cut",
  "club-forged",
  "heart-alloy",
  "bolt",
  "dice-machined",
  "shark-fin",
] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];
