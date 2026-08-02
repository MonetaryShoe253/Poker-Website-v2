import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { DNF_CORRECTION_WINDOW_HOURS, DNF_POSITION_SENTINEL, validateNickname } from "@uos-poker/shared";
import { sessionFromHeaders } from "./auth";
import { prisma } from "./db";
import { getLiveStats } from "./realtime/stats";
import {
  DEFAULT_RECURRENCE,
  ensureActiveSeason,
  ensureUpcomingSessions,
  generateSessionCode,
  getRecurrence,
  pointsForPosition,
} from "./services/seasons";
import {
  applyFloor,
  applyStreakMiss,
  calculateTournamentPoints,
  ensureFormulaConfigSeed,
  getTournamentFormula,
  streakBonusForWeeks,
} from "./services/tournament";
import { computeSessionTimes, createTournamentSeries } from "./services/tournamentSeries";
import { londonDateAndMinutesToUtc, londonToUtc } from "./time";

/**
 * The ops cockpit API (§18). Role-gated; every mutation writes an audit row.
 */

interface AdminCtx {
  userId: string;
  email: string;
}

async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<AdminCtx | null> {
  const session = await sessionFromHeaders({ cookie: req.headers.cookie });
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || role !== "ADMIN") {
    void reply.code(403).send({ error: "Admins only." });
    return null;
  }
  return { userId: session.user.id, email: session.user.email };
}

async function audit(
  actorId: string,
  action: string,
  detail?: unknown,
  target?: { targetType: string; targetId: string },
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      ...(detail !== undefined ? { detail: detail as object } : {}),
      ...(target ? { targetType: target.targetType, targetId: target.targetId } : {}),
    },
  });
}

export type BlindLevel = {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  durationMinutes: number;
  isBreak?: boolean;
};

async function getSessionCloseTimestamp(sessionId: string): Promise<Date | null> {
  const row = await prisma.auditLog.findFirst({
    where: { action: "session.close", targetType: "session", targetId: sessionId },
    orderBy: { createdAt: "desc" },
  });
  return row?.createdAt ?? null;
}

type Scheme = { positions: Record<string, number>; participation: number };

/** Recompute every tournament submission's points for a season. */
async function recomputeSeasonPoints(seriesId: string): Promise<number> {
  const schemeRow = await prisma.pointsScheme.findUnique({ where: { seriesId } });
  const scheme = (schemeRow?.scheme as Scheme | undefined) ?? {
    positions: { "1": 10, "2": 7, "3": 5, "4": 3, "5": 2 },
    participation: 1,
  };
  const submissions = await prisma.sessionEntry.findMany({
    where: { session: { seriesId, type: "TOURNAMENT" }, finishingPosition: { not: null } },
  });
  for (const sub of submissions) {
    const points = pointsForPosition(scheme, sub.finishingPosition!);
    if (points !== sub.points) {
      await prisma.sessionEntry.update({ where: { id: sub.id }, data: { points } });
    }
  }
  return submissions.length;
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  // --- Dashboard ---------------------------------------------------------------
  app.get("/api/admin/dashboard", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const dayAgo = new Date(Date.now() - 86_400_000);
    const [users, verified, signupsWeek, submissionsWeek, activeDay, recentAudit] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { emailVerified: true } }),
        prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.sessionEntry.count({ where: { createdAt: { gte: weekAgo }, voidedAt: null } }),
        prisma.authSession.count({ where: { updatedAt: { gte: dayAgo } } }),
        prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 12,
          include: { actor: true },
        }),
      ]);
    return {
      users,
      verifiedPct: users === 0 ? 0 : Math.round((verified / users) * 100),
      signupsWeek,
      submissionsWeek,
      activeDay,
      live: getLiveStats(),
      recentActions: recentAudit.map((a) => ({
        action: a.action,
        actor: a.actor.email,
        at: a.createdAt,
        detail: a.detail,
      })),
    };
  });

  // --- Sessions (codes live HERE and nowhere else) -------------------------------
  app.get("/api/admin/sessions", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const sessions = await prisma.session.findMany({
      where: { date: { gte: new Date(Date.now() - 14 * 86_400_000) } },
      orderBy: { date: "asc" },
      include: { _count: { select: { entries: true } } },
    });
    return sessions.map((s) => ({
      id: s.id,
      type: s.type,
      date: s.date,
      code: s.code,
      status: s.status,
      submissions: s._count.entries,
    }));
  });

  app.post("/api/admin/sessions/:id/regenerate-code", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const code = generateSessionCode();
    await prisma.session.update({ where: { id }, data: { code } });
    await audit(admin.userId, "session.regenerateCode", { sessionId: id });
    return { ok: true, code };
  });

  app.post("/api/admin/sessions/:id/open", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const session = await prisma.session.findUnique({ where: { id }, include: { series: true } });
    if (!session) return reply.code(404).send({ error: "No such session." });
    if (session.status !== "CREATED" && session.status !== "SCHEDULED") {
      return reply.code(409).send({ error: "Session already opened." });
    }
    const scheduledStartTime =
      session.series.sessionStartMinutesOfDay !== null
        ? londonDateAndMinutesToUtc(session.date, session.series.sessionStartMinutesOfDay)
        : null;
    const schedule = session.blindSchedule as BlindLevel[] | null;
    const shouldAutoStartTimer = Boolean(schedule && schedule.length > 0);
    await prisma.session.update({
      where: { id },
      data: {
        status: "OPEN",
        scheduledStartTime,
        estimatedDuration: session.series.sessionDurationMinutes,
        ...(shouldAutoStartTimer
          ? { currentBlindLevel: 0, timerStartedAt: new Date(), timerPausedAt: null, isPaused: false }
          : {}),
      },
    });
    await audit(admin.userId, "session.open", {
      sessionId: id,
      snapshotted: scheduledStartTime !== null,
      timerAutoStarted: shouldAutoStartTimer,
    });
    return { ok: true };
  });

  app.post("/api/admin/sessions/:id/late-reg-close", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    await prisma.session.update({ where: { id }, data: { status: "LATE_REG_CLOSED" } });
    await audit(admin.userId, "session.lateRegClose", { sessionId: id });
    return { ok: true };
  });

  /** Replays a player's whole series history to derive their current streak
   * — idempotent by construction, so reopening and re-closing a session (a
   * normal correction workflow) never double-applies a week's effect the
   * way an incremental counter would. */
  async function recomputeStreakForPlayer(
    playerId: string,
    seriesId: string,
  ): Promise<{ currentStreak: number; longestStreak: number; streakBonus: number }> {
    const entries = await prisma.sessionEntry.findMany({
      where: {
        playerId,
        voidedAt: null,
        session: { seriesId, type: "TOURNAMENT", status: { in: ["CLOSED", "ARCHIVED"] } },
      },
      include: { session: true },
      orderBy: { session: { date: "asc" } },
    });
    let weeks = 0;
    let longest = 0;
    for (const entry of entries) {
      if (entry.finishingPosition === DNF_POSITION_SENTINEL) {
        weeks = applyStreakMiss(weeks);
      } else {
        weeks += 1;
        longest = Math.max(longest, weeks);
      }
    }
    return { currentStreak: weeks, longestStreak: longest, streakBonus: streakBonusForWeeks(weeks) };
  }

  /** Live sign-out positions are assigned from activePlayerCount, which the
   * TD may have manually corrected downward for people they've noticed left
   * without signing out — so real positions can have gaps mid-session
   * (reserved for suspected DNFs the system can't identify yet). Squeezes
   * those gaps out once, into a dense 1..M sequence, preserving relative
   * order — safe to call repeatedly (a post-close correction re-runs it). */
  async function compressPositions(sessionId: string): Promise<void> {
    const resolved = await prisma.sessionEntry.findMany({
      where: { sessionId, voidedAt: null, finishingPosition: { not: null, lt: DNF_POSITION_SENTINEL } },
      orderBy: { finishingPosition: "asc" },
    });
    for (let i = 0; i < resolved.length; i++) {
      const compressed = i + 1;
      if (resolved[i]!.finishingPosition !== compressed) {
        await prisma.sessionEntry.update({ where: { id: resolved[i]!.id }, data: { finishingPosition: compressed } });
      }
    }
  }

  /** Computes entrantCount/basePoints/floorPoints/points/streak for every
   * resolved (real position or DNF) entry in a TOURNAMENT session — the
   * one place scoring actually happens, called at close and again by any
   * post-close correction so points never go stale relative to position. */
  async function finalizeSessionScoring(sessionId: string, seriesId: string): Promise<void> {
    await compressPositions(sessionId);
    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId }, select: { format: true } });
    const entrantCount = await prisma.sessionEntry.count({ where: { sessionId, voidedAt: null } });
    const formula = await getTournamentFormula();
    const entries = await prisma.sessionEntry.findMany({ where: { sessionId, voidedAt: null } });

    for (const entry of entries) {
      if (entry.finishingPosition === null) continue; // still playing, unresolved — nothing to score yet
      const isDnf = entry.finishingPosition === DNF_POSITION_SENTINEL;
      const { currentStreak, longestStreak, streakBonus } = await recomputeStreakForPlayer(entry.playerId, seriesId);
      await prisma.streak.upsert({
        where: { playerId_seriesId: { playerId: entry.playerId, seriesId } },
        update: { currentStreak, longestStreak, streakBonus },
        create: { playerId: entry.playerId, seriesId, currentStreak, longestStreak, streakBonus },
      });

      // A bounty collected before busting still counts — matches how real
      // bounty tournaments work, so a DNF doesn't zero it out like it does
      // basePoints/floorPoints.
      const bountyPoints =
        session.format === "BOUNTY" ? (entry.bountiesCollected ?? 0) * formula.BOUNTY_VALUE : 0;

      if (isDnf) {
        await prisma.sessionEntry.update({
          where: { id: entry.id },
          data: { entrantCount, basePoints: 0, floorPoints: 0, bountyPoints, points: Math.floor(bountyPoints) },
        });
      } else {
        const basePoints = calculateTournamentPoints(entry.finishingPosition, entrantCount, formula);
        const floored = applyFloor(basePoints);
        await prisma.sessionEntry.update({
          where: { id: entry.id },
          data: {
            entrantCount,
            basePoints,
            floorPoints: floored - basePoints,
            bountyPoints,
            points: Math.floor(floored + streakBonus + bountyPoints),
          },
        });
      }
    }
  }

  app.post("/api/admin/sessions/:id/close", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: "No such session." });
    const shouldPauseTimer = session.timerStartedAt !== null && !session.isPaused;
    await prisma.session.update({
      where: { id },
      data: {
        status: "CLOSED",
        ...(shouldPauseTimer ? { isPaused: true, timerPausedAt: new Date() } : {}),
      },
    });

    if (session.type === "TOURNAMENT") {
      // Anyone still signed in with no result never signed out — DNF.
      await prisma.sessionEntry.updateMany({
        where: { sessionId: id, voidedAt: null, finishingPosition: null, signOutTime: null },
        data: { finishingPosition: DNF_POSITION_SENTINEL },
      });
      await finalizeSessionScoring(id, session.seriesId);
    }

    await audit(admin.userId, "session.close", { sessionId: id }, { targetType: "session", targetId: id });
    return { ok: true };
  });

  app.put("/api/admin/sessions/:id/active-player-count", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const parsed = z.object({ activePlayerCount: z.number().int().min(0) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad active player count." });
    await prisma.session.update({ where: { id }, data: { activePlayerCount: parsed.data.activePlayerCount } });
    await audit(admin.userId, "session.activePlayerCount", { sessionId: id, activePlayerCount: parsed.data.activePlayerCount });
    return { ok: true };
  });

  app.put("/api/admin/sessions/:id/format", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const parsed = z.object({ format: z.enum(["REGULAR", "BOUNTY"]) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad tournament format." });
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: "No such session." });
    if (session.status !== "CREATED" && session.status !== "SCHEDULED") {
      return reply.code(409).send({ error: "Format can only be set before the session opens." });
    }
    await prisma.session.update({ where: { id }, data: { format: parsed.data.format } });
    await audit(admin.userId, "session.format.set", { sessionId: id, format: parsed.data.format });
    return { ok: true };
  });

  app.post("/api/admin/sessions/:id/archive", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    await prisma.session.update({ where: { id }, data: { status: "ARCHIVED" } });
    await audit(admin.userId, "session.archive", { sessionId: id });
    return { ok: true };
  });

  // --- Reverse lifecycle transitions (undo a mistaken click) ---------------------

  app.post("/api/admin/sessions/:id/unarchive", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: "No such session." });
    if (session.status !== "ARCHIVED") return reply.code(409).send({ error: "Session isn't archived." });
    await prisma.session.update({ where: { id }, data: { status: "CLOSED" } });
    await audit(admin.userId, "session.unarchive", { sessionId: id });
    return { ok: true };
  });

  app.post("/api/admin/sessions/:id/reopen", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: "No such session." });
    if (session.status !== "CLOSED") return reply.code(409).send({ error: "Session isn't closed." });
    await prisma.session.update({ where: { id }, data: { status: "LATE_REG_CLOSED" } });
    // Undo the auto-DNF the close route applies to anyone still seated — they were never
    // actually finished, closing was a mistake being reversed.
    await prisma.sessionEntry.updateMany({
      where: { sessionId: id, voidedAt: null, finishingPosition: DNF_POSITION_SENTINEL, signOutTime: null },
      data: { finishingPosition: null, points: null },
    });
    await audit(admin.userId, "session.reopen", { sessionId: id });
    return { ok: true };
  });

  app.post("/api/admin/sessions/:id/reopen-registration", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: "No such session." });
    if (session.status !== "LATE_REG_CLOSED") {
      return reply.code(409).send({ error: "Late registration isn't closed." });
    }
    await prisma.session.update({ where: { id }, data: { status: "OPEN" } });
    await audit(admin.userId, "session.reopenRegistration", { sessionId: id });
    return { ok: true };
  });

  app.post("/api/admin/sessions/:id/unopen", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: "No such session." });
    if (session.status !== "OPEN") return reply.code(409).send({ error: "Session isn't open." });
    await prisma.session.update({
      where: { id },
      data: {
        status: "SCHEDULED",
        scheduledStartTime: null,
        estimatedDuration: null,
        currentBlindLevel: 0,
        timerStartedAt: null,
        timerPausedAt: null,
        isPaused: false,
      },
    });
    await audit(admin.userId, "session.unopen", { sessionId: id });
    return { ok: true };
  });

  // --- Tournament management (series/session drill-down, blind timer, entry overrides) ---------

  app.get("/api/admin/series/:seriesId/sessions", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { seriesId } = req.params as { seriesId: string };
    const sessions = await prisma.session.findMany({
      where: { seriesId, type: "TOURNAMENT" },
      orderBy: { date: "asc" },
      include: { _count: { select: { entries: { where: { voidedAt: null } } } } },
    });
    return sessions.map((s, i) => ({
      id: s.id,
      type: s.type,
      date: s.date,
      status: s.status,
      ordinal: i + 1,
      entryCount: s._count.entries,
      activePlayerCount: s.activePlayerCount,
    }));
  });

  app.get("/api/admin/sessions/:id", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const session = await prisma.session.findUnique({ where: { id }, include: { series: true } });
    if (!session) return reply.code(404).send({ error: "No such session." });
    const [seriesSessions, closedAt] = await Promise.all([
      prisma.session.findMany({
        where: { seriesId: session.seriesId, type: "TOURNAMENT" },
        orderBy: { date: "asc" },
        select: { id: true },
      }),
      getSessionCloseTimestamp(id),
    ]);
    const ordinalIndex = seriesSessions.findIndex((s) => s.id === id);
    const times = computeSessionTimes(session, session.series);
    return {
      id: session.id,
      seriesId: session.seriesId,
      seriesName: session.series.name,
      type: session.type,
      date: session.date,
      status: session.status,
      format: session.format,
      code: session.code,
      ordinal: ordinalIndex === -1 ? null : ordinalIndex + 1,
      activePlayerCount: session.activePlayerCount,
      blindSchedule: session.blindSchedule as BlindLevel[] | null,
      currentBlindLevel: session.currentBlindLevel,
      timerStartedAt: session.timerStartedAt,
      timerPausedAt: session.timerPausedAt,
      isPaused: session.isPaused,
      submissionsOpenAt: session.submissionsOpenAt,
      submissionsCloseAt: session.submissionsCloseAt,
      closedAt,
      scheduledStartAt: times.scheduledStartAt,
      lateRegClosesAt: times.lateRegClosesAt,
      estimatedEndAt: times.estimatedEndAt,
    };
  });

  app.get("/api/admin/sessions/:id/entries", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const entries = await prisma.sessionEntry.findMany({
      where: { sessionId: id },
      include: { player: true },
      orderBy: [{ finishingPosition: { sort: "asc", nulls: "last" } }, { player: { displayName: "asc" } }],
    });
    return entries.map((e) => ({
      id: e.id,
      playerId: e.playerId,
      nickname: e.player.displayName,
      email: e.player.email,
      signInTime: e.signInTime,
      signOutTime: e.signOutTime,
      finishingPosition: e.finishingPosition,
      entrantCount: e.entrantCount,
      points: e.points,
      bountiesCollected: e.bountiesCollected,
      bountyPoints: e.bountyPoints,
      isDNF: e.finishingPosition === DNF_POSITION_SENTINEL,
      voided: e.voidedAt !== null,
      voidedAt: e.voidedAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));
  });

  // --- Kiosk (sign-in / sign-out) ---------------------------------------------------

  function assertKioskOpen(status: string, reply: FastifyReply): boolean {
    if (status !== "OPEN" && status !== "LATE_REG_CLOSED") {
      void reply.code(409).send({ error: "Session isn't open for the kiosk." });
      return false;
    }
    return true;
  }

  app.get("/api/admin/sessions/:id/kiosk/search-players", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const query = ((req.query as { q?: string }).q ?? "").trim();
    if (query.length < 2) return [];
    const [players, existingEntries] = await Promise.all([
      prisma.player.findMany({
        where: { displayName: { contains: query, mode: "insensitive" } },
        orderBy: { displayName: "asc" },
        take: 20,
      }),
      prisma.sessionEntry.findMany({
        where: { sessionId: id, voidedAt: null },
        select: { playerId: true },
      }),
    ]);
    const signedInIds = new Set(existingEntries.map((e) => e.playerId));
    return players.map((p) => ({
      playerId: p.id,
      displayName: p.displayName,
      email: p.email,
      alreadySignedIn: signedInIds.has(p.id),
    }));
  });

  async function kioskSignInPlayer(
    sessionId: string,
    player: { id: string; displayName: string },
    reply: FastifyReply,
  ): Promise<{ id: string } | null> {
    const existing = await prisma.sessionEntry.findUnique({
      where: { sessionId_playerId: { sessionId, playerId: player.id } },
    });
    if (existing && existing.voidedAt === null) {
      void reply.code(409).send({ error: `${player.displayName} is already signed in.` });
      return null;
    }
    return existing
      ? prisma.sessionEntry.update({
          where: { id: existing.id },
          data: {
            signInTime: new Date(),
            voidedAt: null,
            signOutTime: null,
            finishingPosition: null,
            entrantCount: null,
            points: null,
            bountiesCollected: null,
            bountyPoints: null,
          },
        })
      : prisma.sessionEntry.create({ data: { sessionId, playerId: player.id, signInTime: new Date() } });
  }

  const KioskSigninBody = z.object({ playerId: z.string().min(1) });
  app.post("/api/admin/sessions/:id/kiosk/signin", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const parsed = KioskSigninBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad sign-in request." });
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: "No such session." });
    if (!assertKioskOpen(session.status, reply)) return;
    const player = await prisma.player.findUnique({ where: { id: parsed.data.playerId } });
    if (!player) return reply.code(404).send({ error: "No such player." });
    const entry = await kioskSignInPlayer(id, player, reply);
    if (!entry) return;
    await audit(admin.userId, "kiosk.signin", { sessionId: id, playerId: player.id, displayName: player.displayName });
    return { ok: true, entry: { id: entry.id, displayName: player.displayName } };
  });

  const KioskRegisterBody = z.object({
    displayName: z.string().trim().min(1).max(60),
    email: z.string().trim().toLowerCase().email(),
  });
  app.post("/api/admin/sessions/:id/kiosk/register", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const parsed = KioskRegisterBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter a name and a valid email." });
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: "No such session." });
    if (!assertKioskOpen(session.status, reply)) return;
    const existingPlayer = await prisma.player.findUnique({ where: { email: parsed.data.email } });
    const player =
      existingPlayer ??
      (await prisma.player.create({
        data: { displayName: parsed.data.displayName, email: parsed.data.email },
      }));
    const entry = await kioskSignInPlayer(id, player, reply);
    if (!entry) return;
    await audit(admin.userId, "kiosk.register", {
      sessionId: id,
      playerId: player.id,
      displayName: player.displayName,
      reused: Boolean(existingPlayer),
    });
    return { ok: true, entry: { id: entry.id, displayName: player.displayName }, reused: Boolean(existingPlayer) };
  });

  app.get("/api/admin/sessions/:id/kiosk/entries", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const query = ((req.query as { q?: string }).q ?? "").trim();
    const entries = await prisma.sessionEntry.findMany({
      where: {
        sessionId: id,
        voidedAt: null,
        signOutTime: null,
        ...(query ? { player: { displayName: { contains: query, mode: "insensitive" } } } : {}),
      },
      include: { player: true },
      orderBy: { signInTime: "asc" },
      take: 50,
    });
    return entries.map((e) => ({
      entryId: e.id,
      playerId: e.playerId,
      displayName: e.player.displayName,
      signInTime: e.signInTime,
    }));
  });

  const KioskSignoutBody = z.object({
    entryId: z.string().min(1),
    bountiesCollected: z.number().int().min(0).optional(),
  });
  app.post("/api/admin/sessions/:id/kiosk/signout", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const parsed = KioskSignoutBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad sign-out request." });
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: "No such session." });
    if (!assertKioskOpen(session.status, reply)) return;
    const entry = await prisma.sessionEntry.findUnique({
      where: { id: parsed.data.entryId },
      include: { player: true },
    });
    if (!entry || entry.sessionId !== id) return reply.code(404).send({ error: "No such entry." });
    if (entry.voidedAt !== null) return reply.code(409).send({ error: "That entry has been voided." });
    if (entry.signOutTime !== null) return reply.code(409).send({ error: "Already signed out." });

    // Points aren't computed here — only at session close. Position is
    // taken from activePlayerCount, not a raw "still signed in" count, so
    // that when a TD manually corrects it down for someone they've noticed
    // left without signing out, later sign-outs reflect that immediately
    // instead of waiting for close to find out about the DNF. That leaves a
    // gap where the DNF's slot would have been — compressed out at close.
    let activePlayerCount = session.activePlayerCount;
    if (activePlayerCount === null) {
      activePlayerCount = await prisma.sessionEntry.count({
        where: { sessionId: id, voidedAt: null, signOutTime: null },
      });
    }
    const finishingPosition = activePlayerCount;
    const bountiesCollected = parsed.data.bountiesCollected ?? 0;
    await prisma.$transaction([
      prisma.sessionEntry.update({
        where: { id: entry.id },
        data: { signOutTime: new Date(), finishingPosition, bountiesCollected },
      }),
      prisma.session.update({ where: { id }, data: { activePlayerCount: Math.max(0, activePlayerCount - 1) } }),
    ]);
    const totalEnteredSoFar = await prisma.sessionEntry.count({ where: { sessionId: id, voidedAt: null } });

    await audit(admin.userId, "kiosk.signout", {
      sessionId: id,
      entryId: entry.id,
      playerId: entry.playerId,
      finishingPosition,
    });
    return {
      ok: true,
      entry: {
        id: entry.id,
        displayName: entry.player.displayName,
        finishingPosition,
        entrantCount: totalEnteredSoFar,
      },
    };
  });

  app.post("/api/admin/session-entries/:id/undo-signout", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const existing = await prisma.sessionEntry.findUnique({ where: { id }, include: { session: true } });
    if (!existing) return reply.code(404).send({ error: "No such entry." });
    if (existing.session.status === "ARCHIVED") {
      return reply.code(409).send({ error: "Session is archived — no further corrections." });
    }
    if (existing.signOutTime === null) {
      return reply.code(409).send({ error: "This entry hasn't signed out." });
    }
    await prisma.sessionEntry.update({
      where: { id },
      data: {
        signOutTime: null,
        finishingPosition: null,
        entrantCount: null,
        basePoints: null,
        floorPoints: null,
        bountiesCollected: null,
        bountyPoints: null,
        points: null,
      },
    });
    if (existing.session.status === "CLOSED") {
      // Points/positions were already finalized from this entry's old
      // (now-gone) position — recompress everyone real that's left and
      // refinalize so nothing stays stale relative to the correction.
      if (existing.session.type === "TOURNAMENT") {
        await finalizeSessionScoring(existing.sessionId, existing.session.seriesId);
      }
    } else if (existing.session.activePlayerCount !== null) {
      // Live correction: this player is back in the active pool.
      await prisma.session.update({
        where: { id: existing.sessionId },
        data: { activePlayerCount: existing.session.activePlayerCount + 1 },
      });
    }
    await audit(
      admin.userId,
      "sessionEntry.undoSignout",
      { sessionEntryId: id, sessionId: existing.sessionId },
      { targetType: "sessionEntry", targetId: id },
    );
    return { ok: true };
  });

  const BlindLevelSchema = z.object({
    level: z.number().int().min(0),
    smallBlind: z.number().int().min(0),
    bigBlind: z.number().int().min(0),
    ante: z.number().int().min(0).optional(),
    durationMinutes: z.number().int().min(1),
    isBreak: z.boolean().optional(),
  });
  app.put("/api/admin/sessions/:id/blind-schedule", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const parsed = z.object({ levels: z.array(BlindLevelSchema) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad blind schedule." });
    const levels: BlindLevel[] = parsed.data.levels.map((l, i) => ({ ...l, level: i }));
    await prisma.session.update({
      where: { id },
      data: { blindSchedule: levels.length > 0 ? levels : Prisma.JsonNull },
    });
    await audit(admin.userId, "session.blindSchedule.set", { sessionId: id, levelCount: levels.length });
    return { ok: true, blindSchedule: levels };
  });

  app.post("/api/admin/sessions/:id/timer/start", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: "No such session." });
    if (session.status !== "OPEN" && session.status !== "LATE_REG_CLOSED") {
      return reply.code(409).send({ error: "Session must be open before starting the timer." });
    }
    const schedule = session.blindSchedule as BlindLevel[] | null;
    if (!schedule || schedule.length === 0) {
      return reply.code(400).send({ error: "Set a blind schedule first." });
    }
    const updated = await prisma.session.update({
      where: { id },
      data: { currentBlindLevel: 0, timerStartedAt: new Date(), timerPausedAt: null, isPaused: false },
    });
    await audit(admin.userId, "session.timer.start", { sessionId: id });
    return {
      ok: true,
      currentBlindLevel: updated.currentBlindLevel,
      timerStartedAt: updated.timerStartedAt,
      timerPausedAt: updated.timerPausedAt,
      isPaused: updated.isPaused,
    };
  });

  app.post("/api/admin/sessions/:id/timer/pause", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: "No such session." });
    if (!session.timerStartedAt || session.isPaused) {
      return reply.code(409).send({ error: "Timer isn't running." });
    }
    const updated = await prisma.session.update({
      where: { id },
      data: { isPaused: true, timerPausedAt: new Date() },
    });
    await audit(admin.userId, "session.timer.pause", { sessionId: id });
    return { ok: true, isPaused: updated.isPaused, timerPausedAt: updated.timerPausedAt };
  });

  app.post("/api/admin/sessions/:id/timer/resume", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: "No such session." });
    if (!session.isPaused || !session.timerPausedAt || !session.timerStartedAt) {
      return reply.code(409).send({ error: "Timer isn't paused." });
    }
    const pausedMs = Date.now() - session.timerPausedAt.getTime();
    const shiftedStart = new Date(session.timerStartedAt.getTime() + pausedMs);
    const updated = await prisma.session.update({
      where: { id },
      data: { timerStartedAt: shiftedStart, timerPausedAt: null, isPaused: false },
    });
    await audit(admin.userId, "session.timer.resume", { sessionId: id });
    return { ok: true, timerStartedAt: updated.timerStartedAt, isPaused: updated.isPaused };
  });

  app.post("/api/admin/sessions/:id/timer/advance", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const parsed = z.object({ level: z.number().int().min(0).optional() }).safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Bad level." });
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: "No such session." });
    const schedule = session.blindSchedule as BlindLevel[] | null;
    if (!schedule || schedule.length === 0) {
      return reply.code(400).send({ error: "Set a blind schedule first." });
    }
    const target = parsed.data.level ?? session.currentBlindLevel + 1;
    if (target < 0 || target >= schedule.length) {
      return reply.code(400).send({ error: "Already at the final level." });
    }
    const updated = await prisma.session.update({
      where: { id },
      data: { currentBlindLevel: target, timerStartedAt: new Date(), timerPausedAt: null, isPaused: false },
    });
    await audit(admin.userId, "session.timer.advance", {
      sessionId: id,
      fromLevel: session.currentBlindLevel,
      toLevel: target,
    });
    return { ok: true, currentBlindLevel: updated.currentBlindLevel, timerStartedAt: updated.timerStartedAt };
  });

  const PointsEditBody = z.object({
    finishingPosition: z
      .number()
      .int()
      .min(1)
      .refine((v) => v !== DNF_POSITION_SENTINEL, "Use the DNF routes to mark a DNF."),
    bountiesCollected: z.number().int().min(0).optional(),
  });
  app.patch("/api/admin/session-entries/:id/points", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const parsed = PointsEditBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad points edit." });
    const existing = await prisma.sessionEntry.findUnique({ where: { id }, include: { session: true } });
    if (!existing) return reply.code(404).send({ error: "No such entry." });
    if (existing.session.type !== "TOURNAMENT") {
      return reply.code(400).send({ error: "Not a tournament session." });
    }
    await prisma.sessionEntry.update({
      where: { id },
      data: {
        finishingPosition: parsed.data.finishingPosition,
        ...(parsed.data.bountiesCollected !== undefined
          ? { bountiesCollected: parsed.data.bountiesCollected }
          : {}),
      },
    });
    // A manual override still goes through the same floor/streak pipeline
    // as everyone else in the session, not a bare formula calculation, and
    // entrantCount stays a whole-session value rather than a per-entry one.
    await finalizeSessionScoring(existing.sessionId, existing.session.seriesId);
    const updated = await prisma.sessionEntry.findUniqueOrThrow({ where: { id } });
    await audit(
      admin.userId,
      "sessionEntry.points.edit",
      {
        sessionEntryId: id,
        sessionId: existing.sessionId,
        from: { finishingPosition: existing.finishingPosition, points: existing.points },
        to: { finishingPosition: updated.finishingPosition, entrantCount: updated.entrantCount, points: updated.points },
      },
      { targetType: "sessionEntry", targetId: id },
    );
    return {
      ok: true,
      entry: { id: updated.id, finishingPosition: updated.finishingPosition, entrantCount: updated.entrantCount, points: updated.points },
    };
  });

  async function assertWithinDnfWindow(sessionId: string, reply: FastifyReply): Promise<boolean> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      void reply.code(404).send({ error: "No such session." });
      return false;
    }
    if (session.status !== "CLOSED" && session.status !== "ARCHIVED") {
      void reply.code(409).send({ error: "Session must be closed first." });
      return false;
    }
    const closedAt = await getSessionCloseTimestamp(sessionId);
    if (closedAt && Date.now() - closedAt.getTime() > DNF_CORRECTION_WINDOW_HOURS * 3_600_000) {
      void reply.code(403).send({ error: "The 48-hour correction window has closed." });
      return false;
    }
    return true;
  }

  app.post("/api/admin/session-entries/:id/dnf", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const existing = await prisma.sessionEntry.findUnique({ where: { id }, include: { session: true } });
    if (!existing) return reply.code(404).send({ error: "No such entry." });
    if (existing.session.type !== "TOURNAMENT") {
      return reply.code(400).send({ error: "Not a tournament session." });
    }
    if (!(await assertWithinDnfWindow(existing.sessionId, reply))) return;
    await prisma.sessionEntry.update({
      where: { id },
      data: { finishingPosition: DNF_POSITION_SENTINEL, points: 0 },
    });
    await audit(
      admin.userId,
      "sessionEntry.dnf.mark",
      { sessionEntryId: id, sessionId: existing.sessionId },
      { targetType: "sessionEntry", targetId: id },
    );
    return { ok: true, entry: { id, finishingPosition: DNF_POSITION_SENTINEL, points: 0, isDNF: true } };
  });

  app.delete("/api/admin/session-entries/:id/dnf", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const existing = await prisma.sessionEntry.findUnique({ where: { id }, include: { session: true } });
    if (!existing) return reply.code(404).send({ error: "No such entry." });
    if (existing.session.type !== "TOURNAMENT") {
      return reply.code(400).send({ error: "Not a tournament session." });
    }
    if (existing.finishingPosition !== DNF_POSITION_SENTINEL) {
      return reply.code(409).send({ error: "Entry isn't marked DNF." });
    }
    if (!(await assertWithinDnfWindow(existing.sessionId, reply))) return;
    await prisma.sessionEntry.update({ where: { id }, data: { finishingPosition: null, points: null } });
    await audit(
      admin.userId,
      "sessionEntry.dnf.unmark",
      { sessionEntryId: id, sessionId: existing.sessionId },
      { targetType: "sessionEntry", targetId: id },
    );
    return { ok: true, entry: { id, finishingPosition: null, points: null, isDNF: false } };
  });

  const CreateTournamentSeriesBody = z.object({
    name: z.string().min(1).max(60),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sessionStartMinutesOfDay: z.number().int().min(0).max(1439),
    sessionDurationMinutes: z.number().int().min(1),
  });
  app.post("/api/admin/tournament-series", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const parsed = CreateTournamentSeriesBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad series parameters." });
    const { id, sessionCount } = await createTournamentSeries(parsed.data);
    await audit(admin.userId, "tournamentSeries.create", { seriesId: id, name: parsed.data.name, sessionCount });
    return { ok: true, id, sessionCount };
  });

  app.get("/api/admin/tournament-series/:id", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const series = await prisma.series.findUnique({ where: { id } });
    if (!series) return reply.code(404).send({ error: "No such series." });
    return {
      id: series.id,
      name: series.name,
      startsAt: series.startsAt,
      endsAt: series.endsAt,
      status: series.status,
      isActive: series.isActive,
      sessionStartMinutesOfDay: series.sessionStartMinutesOfDay,
      sessionDurationMinutes: series.sessionDurationMinutes,
    };
  });

  const TournamentSeriesParamsBody = z.object({
    sessionStartMinutesOfDay: z.number().int().min(0).max(1439),
    sessionDurationMinutes: z.number().int().min(1),
  });
  app.put("/api/admin/tournament-series/:id/params", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const parsed = TournamentSeriesParamsBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad series parameters." });
    const series = await prisma.series.findUnique({ where: { id } });
    if (!series) return reply.code(404).send({ error: "No such series." });
    await prisma.series.update({ where: { id }, data: parsed.data });
    await audit(admin.userId, "tournamentSeries.updateParams", { seriesId: id, ...parsed.data });
    return { ok: true };
  });

  app.delete("/api/admin/tournament-series/:id", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const series = await prisma.series.findUnique({ where: { id } });
    if (!series) return reply.code(404).send({ error: "No such series." });
    await prisma.series.delete({ where: { id } });
    await audit(admin.userId, "tournamentSeries.delete", { seriesId: id, name: series.name });
    return { ok: true };
  });

  app.post("/api/admin/tournament-series/:id/archive", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const series = await prisma.series.findUnique({ where: { id } });
    if (!series) return reply.code(404).send({ error: "No such series." });
    if (series.status === "ARCHIVED") return reply.code(409).send({ error: "Series already archived." });
    await prisma.series.update({ where: { id }, data: { status: "ARCHIVED" } });
    // Only closed sessions have real, final results to lock — anything
    // scheduled but never run is left alone rather than force-archived.
    const { count } = await prisma.session.updateMany({
      where: { seriesId: id, status: "CLOSED" },
      data: { status: "ARCHIVED" },
    });
    await audit(admin.userId, "tournamentSeries.archive", { seriesId: id, sessionsArchived: count });
    return { ok: true, sessionsArchived: count };
  });

  app.post("/api/admin/tournament-series/:id/unarchive", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const series = await prisma.series.findUnique({ where: { id } });
    if (!series) return reply.code(404).send({ error: "No such series." });
    if (series.status !== "ARCHIVED") return reply.code(409).send({ error: "Series isn't archived." });
    await prisma.series.update({ where: { id }, data: { status: "ACTIVE" } });
    await audit(admin.userId, "tournamentSeries.unarchive", { seriesId: id });
    return { ok: true };
  });

  app.delete("/api/admin/sessions/:id", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return reply.code(404).send({ error: "No such session." });
    await prisma.session.delete({ where: { id } });
    await audit(admin.userId, "session.delete", { sessionId: id }, { targetType: "session", targetId: id });
    return { ok: true };
  });

  const OneOffBody = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    type: z.enum(["TOURNAMENT", "CASH"]),
  });
  app.post("/api/admin/sessions", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const parsed = OneOffBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad date or type." });
    const [y, m, d] = parsed.data.date.split("-").map(Number) as [number, number, number];
    const series = await ensureActiveSeason();
    const session = await prisma.session.upsert({
      where: {
        seriesId_date_type: {
          seriesId: series.id,
          date: londonToUtc(y, m, d),
          type: parsed.data.type,
        },
      },
      create: {
        seriesId: series.id,
        date: londonToUtc(y, m, d),
        type: parsed.data.type,
        code: generateSessionCode(),
        submissionsOpenAt: londonToUtc(y, m, d, 17),
        submissionsCloseAt: londonToUtc(y, m, d, 23, 59, 59),
      },
      update: { status: "SCHEDULED" },
    });
    await audit(admin.userId, "session.create", { sessionId: session.id, date: parsed.data.date });
    return { ok: true, id: session.id, code: session.code };
  });

  app.get("/api/admin/formula", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    await ensureFormulaConfigSeed();
    return getTournamentFormula();
  });

  app.put("/api/admin/formula", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const parsed = z.object({
      A: z.number(),
      B: z.number(),
      ITM_PERCENT: z.number(),
      BOUNTY_VALUE: z.number(),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad formula." });
    for (const [key, value] of Object.entries(parsed.data)) {
      await prisma.formulaConfig.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    }
    await audit(admin.userId, "formula.update", parsed.data);
    return { ok: true };
  });

  const RecurrenceBody = z.array(
    z.object({ weekday: z.number().int().min(0).max(6), type: z.enum(["TOURNAMENT", "CASH"]) }),
  );
  app.get("/api/admin/recurrence", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    return { rules: await getRecurrence(), default: DEFAULT_RECURRENCE };
  });
  app.put("/api/admin/recurrence", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const parsed = RecurrenceBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad recurrence rules." });
    await prisma.setting.upsert({
      where: { key: "sessionRecurrence" },
      create: { key: "sessionRecurrence", value: parsed.data },
      update: { value: parsed.data },
    });
    await ensureUpcomingSessions();
    await audit(admin.userId, "recurrence.update", parsed.data);
    return { ok: true };
  });

  // --- Submissions -----------------------------------------------------------------
  app.get("/api/admin/submissions", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { sessionId, q } = req.query as { sessionId?: string; q?: string };
    const submissions = await prisma.sessionEntry.findMany({
      where: {
        ...(sessionId ? { sessionId } : {}),
        ...(q
          ? { player: { OR: [{ email: { contains: q } }, { displayName: { contains: q } }] } }
          : {}),
      },
      include: { player: true, session: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return submissions.map((s) => ({
      id: s.id,
      nickname: s.player.displayName,
      sessionType: s.session.type,
      sessionDate: s.session.date,
      finishingPosition: s.finishingPosition,
      entrantCount: s.entrantCount,
      points: s.points,
      buyInChips: s.buyInChips,
      cashOutChips: s.cashOutChips,
      netChips: s.netChips,
      voided: s.voidedAt !== null,
      createdAt: s.createdAt,
    }));
  });

  app.post("/api/admin/submissions/:id/void", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    await prisma.sessionEntry.update({
      where: { id },
      data: { voidedAt: new Date(), voidedBy: admin.userId },
    });
    await audit(admin.userId, "submission.void", { submissionId: id });
    return { ok: true };
  });

  app.post("/api/admin/submissions/:id/restore", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    await prisma.sessionEntry.update({
      where: { id },
      data: { voidedAt: null, voidedBy: null },
    });
    await audit(admin.userId, "submission.restore", { submissionId: id });
    return { ok: true };
  });

  const EditSubmissionBody = z.object({
    finishingPosition: z.number().int().min(1).optional(),
    entrantCount: z.number().int().min(2).optional(),
    buyInChips: z.number().int().min(0).optional(),
    cashOutChips: z.number().int().min(0).optional(),
  });
  app.patch("/api/admin/submissions/:id", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const parsed = EditSubmissionBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad edit." });
    const existing = await prisma.sessionEntry.findUnique({
      where: { id },
      include: { session: { include: { series: { include: { pointsScheme: true } } } } },
    });
    if (!existing) return reply.code(404).send({ error: "No such submission." });

    const data: Record<string, unknown> = { ...parsed.data };
    if (existing.session.type === "TOURNAMENT" && parsed.data.finishingPosition) {
      const scheme = existing.session.series.pointsScheme?.scheme as Scheme | undefined;
      data.points = pointsForPosition(
        scheme ?? { positions: { "1": 10, "2": 7, "3": 5, "4": 3, "5": 2 }, participation: 1 },
        parsed.data.finishingPosition,
      );
    }
    if (existing.session.type === "CASH") {
      const buyIn = parsed.data.buyInChips ?? existing.buyInChips ?? 0;
      const cashOut = parsed.data.cashOutChips ?? existing.cashOutChips ?? 0;
      data.netChips = cashOut - buyIn;
    }
    await prisma.sessionEntry.update({ where: { id }, data });
    await audit(admin.userId, "submission.edit", { submissionId: id, ...parsed.data });
    return { ok: true };
  });

  // --- Points scheme -------------------------------------------------------------
  app.get("/api/admin/points-scheme/:seasonId", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { seasonId } = req.params as { seasonId: string };
    const row = await prisma.pointsScheme.findUnique({ where: { seriesId: seasonId } });
    return { scheme: (row?.scheme as Scheme | undefined) ?? null };
  });

  const SchemeBody = z.object({
    positions: z.record(z.string().regex(/^\d+$/), z.number().int().min(0)),
    participation: z.number().int().min(0),
  });
  app.put("/api/admin/points-scheme/:seasonId", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { seasonId } = req.params as { seasonId: string };
    const parsed = SchemeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad scheme." });
    await prisma.pointsScheme.upsert({
      where: { seriesId: seasonId },
      create: { seriesId: seasonId, scheme: parsed.data },
      update: { scheme: parsed.data },
    });
    const recomputed = await recomputeSeasonPoints(seasonId);
    await audit(admin.userId, "pointsScheme.update", { seasonId, recomputed });
    return { ok: true, recomputed };
  });

  // --- Seasons ----------------------------------------------------------------------
  const SeasonBody = z.object({
    name: z.string().min(1).max(60),
    startsAt: z.string(),
    endsAt: z.string(),
  });
  app.post("/api/admin/seasons", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const parsed = SeasonBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad season." });
    await prisma.series.updateMany({ data: { isActive: false }, where: { isActive: true } });
    const season = await prisma.series.create({
      data: {
        name: parsed.data.name,
        startsAt: new Date(parsed.data.startsAt),
        endsAt: new Date(parsed.data.endsAt),
        isActive: true,
        status: "ACTIVE",
      },
    });
    await prisma.pointsScheme.create({
      data: {
        seriesId: season.id,
        scheme: { positions: { "1": 10, "2": 7, "3": 5, "4": 3, "5": 2 }, participation: 1 },
      },
    });
    await ensureUpcomingSessions();
    await audit(admin.userId, "season.create", { seasonId: season.id, name: season.name });
    return { ok: true, id: season.id };
  });

  /** End a season: freeze it and derive Hall of Fame champions. */
  app.post("/api/admin/seasons/:id/end", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };

    const submissions = await prisma.sessionEntry.findMany({
      where: { session: { seriesId: id }, voidedAt: null },
      include: { player: true, session: true },
    });
    const points = new Map<string, { nickname: string; value: number }>();
    const net = new Map<string, { nickname: string; value: number }>();
    for (const sub of submissions) {
      const nickname = sub.player.displayName;
      if (sub.session.type === "TOURNAMENT" && sub.points) {
        const entry = points.get(sub.playerId) ?? { nickname, value: 0 };
        entry.value += sub.points;
        points.set(sub.playerId, entry);
      }
      if (sub.session.type === "CASH" && sub.netChips !== null) {
        const entry = net.get(sub.playerId) ?? { nickname, value: 0 };
        entry.value += sub.netChips;
        net.set(sub.playerId, entry);
      }
    }
    const champion = (map: Map<string, { nickname: string; value: number }>) =>
      [...map.values()].sort((a, b) => b.value - a.value)[0] ?? null;

    const tournamentChampion = champion(points);
    const cashChampion = champion(net);
    await prisma.$transaction(async (tx) => {
      await tx.series.update({ where: { id }, data: { isActive: false, endsAt: new Date() } });
      for (const [board, entry] of [
        ["TOURNAMENT", tournamentChampion],
        ["CASH", cashChampion],
      ] as const) {
        if (entry) {
          await tx.hallOfFameEntry.upsert({
            where: { seriesId_board: { seriesId: id, board } },
            create: { seriesId: id, board, nickname: entry.nickname, value: entry.value },
            update: { nickname: entry.nickname, value: entry.value },
          });
        }
      }
    });
    await audit(admin.userId, "season.end", {
      seasonId: id,
      tournamentChampion,
      cashChampion,
    });
    return { ok: true, tournamentChampion, cashChampion };
  });

  // --- Users ------------------------------------------------------------------------
  app.get("/api/admin/users", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { q } = req.query as { q?: string };
    const users = await prisma.user.findMany({
      where: q
        ? { OR: [{ email: { contains: q } }, { profile: { nickname: { contains: q } } }] }
        : {},
      include: { profile: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      nickname: u.profile?.nickname ?? null,
      role: u.role,
      emailVerified: u.emailVerified,
      chatBanned: u.profile?.chatBannedAt !== null && u.profile !== null,
      suspended: u.profile?.suspendedAt !== null && u.profile !== null,
      createdAt: u.createdAt,
    }));
  });

  const RenameBody = z.object({ nickname: z.string().min(1).max(32) });
  app.post("/api/admin/users/:id/rename", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    const parsed = RenameBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad nickname." });
    const verdict = validateNickname(parsed.data.nickname);
    if (!verdict.ok) return reply.code(400).send({ error: `Nickname rejected (${verdict.reason}).` });
    try {
      await prisma.profile.update({
        where: { userId: id },
        data: { nickname: parsed.data.nickname },
      });
    } catch {
      return reply.code(409).send({ error: "Taken or no profile." });
    }
    await audit(admin.userId, "user.rename", { userId: id, nickname: parsed.data.nickname });
    return { ok: true };
  });

  for (const [path, action, data] of [
    ["chat-ban", "user.chatBan", { chatBannedAt: new Date() }],
    ["chat-unban", "user.chatUnban", { chatBannedAt: null }],
    ["suspend", "user.suspend", { suspendedAt: new Date() }],
    ["unsuspend", "user.unsuspend", { suspendedAt: null }],
  ] as const) {
    app.post(`/api/admin/users/:id/${path}`, async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const { id } = req.params as { id: string };
      await prisma.profile.update({ where: { userId: id }, data });
      await audit(admin.userId, action, { userId: id });
      return { ok: true };
    });
  }

  app.post("/api/admin/users/:id/promote", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    await prisma.user.update({ where: { id }, data: { role: "ADMIN" } });
    await audit(admin.userId, "user.promote", { userId: id });
    return { ok: true };
  });

  // --- Announcement banner --------------------------------------------------------
  app.get("/api/announcement", async () => {
    try {
      const announcement = await prisma.announcement.findFirst({
        where: { active: true },
        orderBy: { createdAt: "desc" },
      });
      return { message: announcement?.message ?? null };
    } catch {
      return { message: null };
    }
  });

  const BannerBody = z.object({ message: z.string().min(1).max(300) });
  app.put("/api/admin/announcement", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const parsed = BannerBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Bad banner." });
    await prisma.announcement.updateMany({ data: { active: false }, where: { active: true } });
    await prisma.announcement.create({
      data: { message: parsed.data.message, active: true, createdBy: admin.userId },
    });
    await audit(admin.userId, "announcement.set", { message: parsed.data.message });
    return { ok: true };
  });

  app.delete("/api/admin/announcement", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    await prisma.announcement.updateMany({ data: { active: false }, where: { active: true } });
    await audit(admin.userId, "announcement.clear");
    return { ok: true };
  });
}
