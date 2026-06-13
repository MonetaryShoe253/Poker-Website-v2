import { z } from "zod";
import type { BotTier } from "./constants";

/**
 * Socket event contracts. Every client→server payload is zod-validated on
 * the server; server→client payloads are typed here so the client renders
 * exactly what the server sends.
 *
 * SECURITY INVARIANT: TableStatePayload and TableEventPayload are
 * personalised per socket. `myCards` is the only place a viewer's hole
 * cards appear; `revealed` contains only legitimately shown cards. No other
 * hole-card data may ever enter these payloads.
 */

// ---------------------------------------------------------------------------
// Client → server
// ---------------------------------------------------------------------------

export const TableActionSchema = z.object({
  tableId: z.string().min(1),
  handNo: z.number().int().nonnegative(),
  /** The action sequence the client saw; stale = rejected. */
  seq: z.number().int().nonnegative(),
  action: z.enum(["FOLD", "CHECK", "CALL", "BET", "RAISE"]),
  amount: z.number().int().positive().optional(),
});
export type TableActionMessage = z.infer<typeof TableActionSchema>;

export const SitDownSchema = z.object({
  tableId: z.string().min(1),
  seat: z.number().int().min(0).max(5).optional(),
  buyIn: z.number().int().positive(),
});
export type SitDownMessage = z.infer<typeof SitDownSchema>;

export const JoinTableSchema = z.object({ tableId: z.string().min(1) });
export const ChatSchema = z.object({
  tableId: z.string().min(1),
  message: z.string().min(1).max(300),
});
export const PracticeSchema = z.object({
  tier: z.enum(["FISH", "CASUAL", "SOLID", "SHARK"]),
  botCount: z.number().int().min(1).max(5),
});

// ---------------------------------------------------------------------------
// Server → client
// ---------------------------------------------------------------------------

export interface LobbyTableSummary {
  tableId: string;
  name: string;
  humans: number;
  bots: number;
  spectators: number;
  /** Average pot over recent hands. */
  avgPot: number;
  seatsFree: number;
  isPractice: boolean;
}

export interface LobbyStatePayload {
  tables: LobbyTableSummary[];
  playersOnline: number;
}

export type TablePhase = "WAITING" | "BETTING" | "RUNOUT" | "COMPLETE";
export type StreetName = "PREFLOP" | "FLOP" | "TURN" | "RIVER";

export interface SeatPayload {
  seat: number;
  nickname: string;
  avatarId: string;
  isBot: boolean;
  botTier?: BotTier;
  stack: number;
  committed: number;
  folded: boolean;
  allIn: boolean;
  sittingOut: boolean;
  disconnected: boolean;
  lastAction?: string;
}

export interface LegalActionsPayload {
  fold: boolean;
  check: boolean;
  call?: { amount: number; allIn: boolean };
  bet?: { minTo: number; maxTo: number };
  raise?: { minTo: number; maxTo: number };
}

export interface TableStatePayload {
  tableId: string;
  name: string;
  isPractice: boolean;
  phase: TablePhase;
  handNo: number;
  seq: number;
  street: StreetName | null;
  board: string[];
  pots: Array<{ amount: number; eligibleSeats: number[] }>;
  totalPot: number;
  seats: Array<SeatPayload | null>;
  buttonSeat: number | null;
  actionSeat: number | null;
  /** Epoch ms deadline for the current actor (server-authoritative). */
  actionDeadline: number | null;
  /** Whether the current actor's time bank is engaged. */
  timeBankEngaged: boolean;
  /** Cards legitimately revealed this hand (runout/showdown), by seat. */
  revealed: Record<number, string[]>;
  /** Hand names shown at showdown, by seat. */
  shownHandNames: Record<number, string>;
  winningSeats: number[];
  /** The five cards forming the winning hand(s) — the showdown glow. */
  winningCards: string[];
  spectators: number;
  /** Viewer-specific. */
  mySeat: number | null;
  myCards: string[] | null;
  myLegal: LegalActionsPayload | null;
  sittingOut: boolean;
  /** One-liners for the hand log panel (newest last). */
  handLog: string[];
}

export interface TableEventPayload {
  tableId: string;
  handNo: number;
  event:
    | { kind: "HAND_START"; buttonSeat: number }
    | { kind: "BLIND"; seat: number; amount: number }
    | { kind: "DEALT" }
    | { kind: "ACTION"; seat: number; action: string; committed: number; allIn: boolean }
    | { kind: "STREET"; street: StreetName; cards: string[] }
    | { kind: "POTS"; totalPot: number }
    | { kind: "REVEAL"; seat: number; cards: string[]; handName?: string }
    | { kind: "MUCK"; seat: number }
    | { kind: "WIN"; seat: number; amount: number; handName?: string }
    | { kind: "HAND_END" }
    | { kind: "PLAYER_SAT"; seat: number; nickname: string }
    | { kind: "PLAYER_STOOD"; seat: number; nickname: string };
}

export interface ChatPayload {
  tableId: string;
  nickname: string;
  message: string;
  at: number;
}

export interface ServerNoticePayload {
  message: string;
  kind: "info" | "warning";
}

export interface TableErrorPayload {
  code:
    | "NOT_YOUR_TURN"
    | "STALE_ACTION"
    | "BAD_ACTION"
    | "BAD_AMOUNT"
    | "CANNOT_CHECK"
    | "CANNOT_RAISE"
    | "HAND_COMPLETE"
    | "NO_SEAT"
    | "SEAT_TAKEN"
    | "TABLE_FULL"
    | "TABLE_NOT_FOUND"
    | "INSUFFICIENT_BANKROLL"
    | "ALREADY_SEATED"
    | "RATE_LIMITED"
    | "NOT_AUTHENTICATED";
  message: string;
}

/** Event names, single source of truth. */
export const SOCKET_EVENTS = {
  // client → server
  lobbySubscribe: "lobby:subscribe",
  lobbyUnsubscribe: "lobby:unsubscribe",
  playNow: "lobby:playNow",
  practice: "lobby:practice",
  joinTable: "table:join",
  leaveTable: "table:leave",
  sitDown: "table:sit",
  standUp: "table:stand",
  action: "table:action",
  chat: "table:chat",
  imBack: "table:imBack",
  // server → client
  lobbyState: "lobby:state",
  tableState: "table:state",
  tableEvent: "table:event",
  tableChat: "table:chatMessage",
  tableError: "table:error",
  serverNotice: "server:notice",
} as const;
