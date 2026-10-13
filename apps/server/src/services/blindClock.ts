import type { Session } from "@prisma/client";
import { resolveBlindClock, type TournamentBlindLevel } from "@uos-poker/shared";
import { prisma } from "../db";

/**
 * Brings a session's stored blind clock up to date — rolling it onto every
 * level whose timer has run out — and persists the result. Called on every
 * read or adjustment of the clock, so the schedule progresses by itself at
 * 0:00 with no director input and no background scheduler.
 *
 * The write is conditional on the level/start we read, so a concurrent
 * manual change (e.g. "Previous level") always wins over a stale catch-up.
 */
export async function syncBlindClock<S extends Session>(session: S, now = Date.now()): Promise<S> {
  const resolved = resolveBlindClock(
    session.blindSchedule as TournamentBlindLevel[] | null,
    {
      currentBlindLevel: session.currentBlindLevel,
      timerStartedAt: session.timerStartedAt?.getTime() ?? null,
      timerPausedAt: session.timerPausedAt?.getTime() ?? null,
      isPaused: session.isPaused,
    },
    now,
  );
  if (!resolved.advanced || resolved.timerStartedAt === null) return session;

  const timerStartedAt = new Date(resolved.timerStartedAt);
  const { count } = await prisma.session.updateMany({
    where: {
      id: session.id,
      currentBlindLevel: session.currentBlindLevel,
      timerStartedAt: session.timerStartedAt,
    },
    data: { currentBlindLevel: resolved.currentBlindLevel, timerStartedAt },
  });
  if (count === 0) {
    // Someone else changed the clock between our read and write — use theirs.
    const fresh = await prisma.session.findUnique({ where: { id: session.id } });
    return fresh ? { ...session, ...fresh } : session;
  }
  return { ...session, currentBlindLevel: resolved.currentBlindLevel, timerStartedAt };
}
