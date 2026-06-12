import { BANKROLL } from "@uos-poker/shared";

/**
 * Player identity + bankroll source.
 *
 * P2 DEV MODE: ephemeral users keyed by nickname with in-memory bankrolls.
 * P3 replaces `resolveUser` with Better Auth session lookup and bankrolls
 * move to the Profile table. The shape stays the same so the realtime layer
 * doesn't change.
 */
export interface UserCtx {
  userId: string;
  nickname: string;
  avatarId: string;
}

const bankrolls = new Map<string, number>();

export function getBankroll(userId: string): number {
  return bankrolls.get(userId) ?? BANKROLL.starting;
}

export function adjustBankroll(userId: string, delta: number): number {
  const next = getBankroll(userId) + delta;
  if (next < 0) throw new Error(`Bankroll for ${userId} would go negative`);
  bankrolls.set(userId, next);
  return next;
}

export function devResolveUser(auth: Record<string, unknown> | undefined): UserCtx | null {
  const nickname = typeof auth?.nickname === "string" ? auth.nickname.trim() : "";
  if (!/^[A-Za-z0-9_-]{3,16}$/.test(nickname)) return null;
  return {
    userId: `dev:${nickname.toLowerCase()}`,
    nickname,
    avatarId: "spade-ember",
  };
}
