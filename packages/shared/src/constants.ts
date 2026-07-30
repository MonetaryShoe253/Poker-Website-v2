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

/** Fixed late-registration window for tournament series — not per-series yet. */
export const TOURNAMENT_LATE_REG_WINDOW_MINUTES = 70;

/** A finishing position at or better than this counts as "reaching the final table". */
export const FINAL_TABLE_SIZE = 9;

/** Guaranteed minimum points for any non-DNF tournament finish, even outside the ITM cutoff. */
export const TOURNAMENT_FLOOR_POINTS = 2;

/** Only a player's best N sessions count toward their leaderboard points total. */
export const TOURNAMENT_BEST_SESSIONS_COUNT = 8;

export interface TournamentBlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  durationMinutes: number;
  isBreak?: boolean;
}

/** Starting stack and chip denominations for the fixed tournament structure below. */
export const TOURNAMENT_STARTING_STACK = 30_000;
export const TOURNAMENT_CHIP_DENOMINATIONS = [100, 500, 1_000, 5_000, 25_000] as const;

const REGULAR_LEVEL_MINUTES = 15;

/**
 * Fixed blind structure for every in-person tournament — no per-field-size
 * auto-calculation yet, so every session uses the same schedule.
 */
export const FIXED_TOURNAMENT_BLIND_SCHEDULE: TournamentBlindLevel[] = [
  { level: 0, smallBlind: 100, bigBlind: 200, durationMinutes: REGULAR_LEVEL_MINUTES },
  { level: 1, smallBlind: 200, bigBlind: 400, durationMinutes: REGULAR_LEVEL_MINUTES },
  { level: 2, smallBlind: 300, bigBlind: 600, durationMinutes: REGULAR_LEVEL_MINUTES },
  { level: 3, smallBlind: 400, bigBlind: 800, durationMinutes: REGULAR_LEVEL_MINUTES },
  { level: 4, smallBlind: 0, bigBlind: 0, durationMinutes: 5, isBreak: true },
  { level: 5, smallBlind: 500, bigBlind: 1_000, durationMinutes: REGULAR_LEVEL_MINUTES },
  { level: 6, smallBlind: 700, bigBlind: 1_400, durationMinutes: REGULAR_LEVEL_MINUTES },
  { level: 7, smallBlind: 1_000, bigBlind: 2_000, durationMinutes: REGULAR_LEVEL_MINUTES },
  { level: 8, smallBlind: 1_500, bigBlind: 3_000, durationMinutes: REGULAR_LEVEL_MINUTES },
  { level: 9, smallBlind: 2_000, bigBlind: 4_000, durationMinutes: REGULAR_LEVEL_MINUTES },
  { level: 10, smallBlind: 3_000, bigBlind: 6_000, durationMinutes: REGULAR_LEVEL_MINUTES },
  { level: 11, smallBlind: 0, bigBlind: 0, durationMinutes: 10, isBreak: true },
  { level: 12, smallBlind: 4_000, bigBlind: 8_000, durationMinutes: REGULAR_LEVEL_MINUTES },
  { level: 13, smallBlind: 7_500, bigBlind: 15_000, durationMinutes: REGULAR_LEVEL_MINUTES },
  { level: 14, smallBlind: 10_000, bigBlind: 20_000, durationMinutes: REGULAR_LEVEL_MINUTES },
  { level: 15, smallBlind: 15_000, bigBlind: 30_000, durationMinutes: REGULAR_LEVEL_MINUTES },
  { level: 16, smallBlind: 20_000, bigBlind: 40_000, durationMinutes: REGULAR_LEVEL_MINUTES },
  { level: 17, smallBlind: 30_000, bigBlind: 60_000, durationMinutes: REGULAR_LEVEL_MINUTES },
  { level: 18, smallBlind: 50_000, bigBlind: 100_000, durationMinutes: REGULAR_LEVEL_MINUTES },
];

/** Default tournament points scheme; per-season copies are admin-editable. */
export const DEFAULT_POINTS_SCHEME = {
  positions: { 1: 10, 2: 7, 3: 5, 4: 3, 5: 2 } as Record<number, number>,
  participation: 1,
};

/** Cash submissions with |net| above this ask "looks big — sure?" (never block). */
export const CASH_NET_SOFT_LIMIT = 2_000;

/** Sentinel finishingPosition marking a DNF (did-not-finish/sign-out). */
export const DNF_POSITION_SENTINEL = 999_999;

/** Window after session close during which admins can still edit DNF status. */
export const DNF_CORRECTION_WINDOW_HOURS = 48;

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
