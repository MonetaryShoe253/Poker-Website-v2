import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { validateNickname } from "@uos-poker/shared";
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
import { londonToUtc } from "./time";

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

async function audit(actorId: string, action: string, detail?: unknown): Promise<void> {
  await prisma.auditLog.create({
    data: { actorId, action, ...(detail !== undefined ? { detail: detail as object } : {}) },
  });
}

type Scheme = { positions: Record<string, number>; participation: number };

/** Recompute every tournament submission's points for a season. */
async function recomputeSeasonPoints(seasonId: string): Promise<number> {
  const schemeRow = await prisma.pointsScheme.findUnique({ where: { seasonId } });
  const scheme = (schemeRow?.scheme as Scheme | undefined) ?? {
    positions: { "1": 10, "2": 7, "3": 5, "4": 3, "5": 2 },
    participation: 1,
  };
  const submissions = await prisma.submission.findMany({
    where: { session: { seasonId, type: "TOURNAMENT" }, finishingPosition: { not: null } },
  });
  for (const sub of submissions) {
    const points = pointsForPosition(scheme, sub.finishingPosition!);
    if (points !== sub.points) {
      await prisma.submission.update({ where: { id: sub.id }, data: { points } });
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
        prisma.submission.count({ where: { createdAt: { gte: weekAgo }, voidedAt: null } }),
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
      include: { _count: { select: { submissions: true } } },
    });
    return sessions.map((s) => ({
      id: s.id,
      type: s.type,
      date: s.date,
      code: s.code,
      status: s.status,
      submissions: s._count.submissions,
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

  app.post("/api/admin/sessions/:id/cancel", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { id } = req.params as { id: string };
    await prisma.session.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(admin.userId, "session.cancel", { sessionId: id });
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
    const season = await ensureActiveSeason();
    const session = await prisma.session.upsert({
      where: {
        seasonId_date_type: {
          seasonId: season.id,
          date: londonToUtc(y, m, d),
          type: parsed.data.type,
        },
      },
      create: {
        seasonId: season.id,
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
    const submissions = await prisma.submission.findMany({
      where: {
        ...(sessionId ? { sessionId } : {}),
        ...(q
          ? { user: { OR: [{ email: { contains: q } }, { profile: { nickname: { contains: q } } }] } }
          : {}),
      },
      include: { user: { include: { profile: true } }, session: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return submissions.map((s) => ({
      id: s.id,
      nickname: s.user.profile?.nickname ?? s.user.email,
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
    await prisma.submission.update({
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
    await prisma.submission.update({
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
    const existing = await prisma.submission.findUnique({
      where: { id },
      include: { session: { include: { season: { include: { pointsScheme: true } } } } },
    });
    if (!existing) return reply.code(404).send({ error: "No such submission." });

    const data: Record<string, unknown> = { ...parsed.data };
    if (existing.session.type === "TOURNAMENT" && parsed.data.finishingPosition) {
      const scheme = existing.session.season.pointsScheme?.scheme as Scheme | undefined;
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
    await prisma.submission.update({ where: { id }, data });
    await audit(admin.userId, "submission.edit", { submissionId: id, ...parsed.data });
    return { ok: true };
  });

  // --- Points scheme -------------------------------------------------------------
  app.get("/api/admin/points-scheme/:seasonId", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { seasonId } = req.params as { seasonId: string };
    const row = await prisma.pointsScheme.findUnique({ where: { seasonId } });
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
      where: { seasonId },
      create: { seasonId, scheme: parsed.data },
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
    await prisma.season.updateMany({ data: { isActive: false }, where: { isActive: true } });
    const season = await prisma.season.create({
      data: {
        name: parsed.data.name,
        startsAt: new Date(parsed.data.startsAt),
        endsAt: new Date(parsed.data.endsAt),
        isActive: true,
      },
    });
    await prisma.pointsScheme.create({
      data: {
        seasonId: season.id,
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

    const submissions = await prisma.submission.findMany({
      where: { session: { seasonId: id }, voidedAt: null },
      include: { user: { include: { profile: true } }, session: true },
    });
    const points = new Map<string, { nickname: string; value: number }>();
    const net = new Map<string, { nickname: string; value: number }>();
    for (const sub of submissions) {
      const nickname = sub.user.profile?.nickname ?? "—";
      if (sub.session.type === "TOURNAMENT" && sub.points) {
        const entry = points.get(sub.userId) ?? { nickname, value: 0 };
        entry.value += sub.points;
        points.set(sub.userId, entry);
      }
      if (sub.session.type === "CASH" && sub.netChips !== null) {
        const entry = net.get(sub.userId) ?? { nickname, value: 0 };
        entry.value += sub.netChips;
        net.set(sub.userId, entry);
      }
    }
    const champion = (map: Map<string, { nickname: string; value: number }>) =>
      [...map.values()].sort((a, b) => b.value - a.value)[0] ?? null;

    const tournamentChampion = champion(points);
    const cashChampion = champion(net);
    await prisma.$transaction(async (tx) => {
      await tx.season.update({ where: { id }, data: { isActive: false, endsAt: new Date() } });
      for (const [board, entry] of [
        ["TOURNAMENT", tournamentChampion],
        ["CASH", cashChampion],
      ] as const) {
        if (entry) {
          await tx.hallOfFameEntry.upsert({
            where: { seasonId_board: { seasonId: id, board } },
            create: { seasonId: id, board, nickname: entry.nickname, value: entry.value },
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
    const announcement = await prisma.announcement.findFirst({
      where: { active: true },
      orderBy: { createdAt: "desc" },
    });
    return { message: announcement?.message ?? null };
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
