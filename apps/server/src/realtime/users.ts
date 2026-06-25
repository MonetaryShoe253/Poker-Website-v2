import { BANKROLL } from "@uos-poker/shared";
import { prisma } from "../db";

/**
 * Player identity + bankrolls.
 *
 * Bankrolls are cached in memory (the realtime layer mutates them
 * synchronously mid-game) and written through to Profile asynchronously,
 * serialised per user. Dev-door users (`dev:` prefix, non-production only)
 * never touch the database.
 */
export interface UserCtx {
  userId: string;
  nickname: string;
  avatarId: string;
  /** Show losing hands at showdown instead of mucking (profile setting). */
  showLosing?: boolean;
  /** Chat-banned by an admin: connection is fine, messages are dropped. */
  chatBanned?: boolean;
  /**
   * Ephemeral demo visitor (production "try as guest"): may spectate and play
   * practice (bot, unrated) tables, but never the public rated tables. No DB
   * identity, no persistence — same restrictions enforced server-side.
   */
  isGuest?: boolean;
}

const cache = new Map<string, number>();
const writeQueue = new Map<string, Promise<void>>();

/** Ephemeral identities (dev door + production guests) never touch the DB. */
const isEphemeralUser = (userId: string) =>
  userId.startsWith("dev:") || userId.startsWith("guest:");

/** Load (or refresh) a user's bankroll into the cache. Call at connect. */
export async function hydrateBankroll(userId: string): Promise<number> {
  if (isEphemeralUser(userId)) {
    if (!cache.has(userId)) cache.set(userId, BANKROLL.starting);
    return cache.get(userId)!;
  }
  if (!cache.has(userId)) {
    const profile = await prisma.profile.findUnique({ where: { userId } });
    cache.set(userId, profile?.bankroll ?? BANKROLL.starting);
  }
  return cache.get(userId)!;
}

export function getBankroll(userId: string): number {
  return cache.get(userId) ?? BANKROLL.starting;
}

export function adjustBankroll(userId: string, delta: number): number {
  const next = getBankroll(userId) + delta;
  if (next < 0) throw new Error(`Bankroll for ${userId} would go negative`);
  cache.set(userId, next);
  persist(userId, next);
  return next;
}

function persist(userId: string, value: number): void {
  if (isEphemeralUser(userId)) return;
  const prev = writeQueue.get(userId) ?? Promise.resolve();
  writeQueue.set(
    userId,
    prev
      .then(() =>
        prisma.profile.update({ where: { userId }, data: { bankroll: value } }).then(() => {}),
      )
      .catch((err) => {
        console.error(`Bankroll persist failed for ${userId}:`, err);
      }),
  );
}

/** Wait for pending bankroll writes (graceful shutdown / tests). */
export async function flushBankrolls(): Promise<void> {
  await Promise.all([...writeQueue.values()]);
}

/** Dev door: nickname-keyed ephemeral identity. Never active in production. */
export function devResolveUser(auth: Record<string, unknown> | undefined): UserCtx | null {
  const nickname = typeof auth?.nickname === "string" ? auth.nickname.trim() : "";
  if (!/^[A-Za-z0-9_-]{3,16}$/.test(nickname)) return null;
  return {
    userId: `dev:${nickname.toLowerCase()}`,
    nickname,
    avatarId: "spade-ember",
  };
}

/**
 * Production guest door: an explicit, opt-in demo identity. The client must
 * send `guest: true` alongside a valid nickname — a plain nickname (no flag)
 * is ignored so an unauthenticated socket never silently becomes a player.
 * Guests are flagged so the realtime layer can restrict them to practice and
 * spectating; they carry an ephemeral `guest:` userId that never persists.
 */
export function guestResolveUser(auth: Record<string, unknown> | undefined): UserCtx | null {
  if (auth?.guest !== true) return null;
  const nickname = typeof auth?.nickname === "string" ? auth.nickname.trim() : "";
  if (!/^[A-Za-z0-9_-]{3,16}$/.test(nickname)) return null;
  return {
    userId: `guest:${nickname.toLowerCase()}`,
    nickname,
    avatarId: "spade-ember",
    isGuest: true,
  };
}
