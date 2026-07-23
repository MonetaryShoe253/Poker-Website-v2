import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { BANKROLL, ELO } from "@uos-poker/shared";
import { sessionFromHeaders } from "./auth";
import { prisma } from "./db";
import { isProd } from "./env";
import { adjustBankroll, hydrateBankroll } from "./realtime/users";
import {
  ensureActiveSeason,
  generateSessionCode,
  pointsForPosition,
} from "./services/seasons";
import { calculateTournamentPoints, getTournamentFormula } from "./services/tournament";
import { addLondonDays, londonMidnight, londonParts, londonToUtc } from "./time";

/** Resolve the verified user for a request, or null. */
async function verifiedUser(req: FastifyRequest) {
  const session = await sessionFromHeaders({ cookie: req.headers.cookie });
  if (!session?.user || !session.user.emailVerified) return null;
  return session.user;
}

const TournamentSubmission = z.object({
  sessionId: z.string().min(1),
  code: z.string().min(1).max(12),
  finishingPosition: z.number().int().min(1),
  entrantCount: z.number().int().min(2).max(500),
});

const CashSubmission = z.object({
  sessionId: z.string().min(1),
  code: z.string().min(1).max(12),
  buyInChips: z.number().int().min(0).max(1_000_000),
  cashOutChips: z.number().int().min(0).max(1_000_000),
});

const SettingsBody = z.object({
  sounds: z.boolean().optional(),
  fourColourDeck: z.boolean().optional(),
  autoMuck: z.boolean().optional(),
  showLosing: z.boolean().optional(),
});

export async function registerGameRoutes(app: FastifyInstance): Promise<void> {
  // --- Seasons & sessions ------------------------------------------------------

  app.get("/api/seasons", async () => {
    const series = await prisma.series.findMany({ orderBy: { startsAt: "desc" } });
    return series.map((s) => ({
      id: s.id,
      name: s.name,
      isActive: s.isActive,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
    }));
  });

  app.get("/api/sessions/upcoming", async () => {
    try {
      const sessions = await prisma.session.findMany({
        where: { date: { gte: londonMidnight(new Date()) }, status: "SCHEDULED" },
        orderBy: { date: "asc" },
        take: 8,
      });
      // No codes here, ever — codes live in the admin panel only.
      return sessions.map((s) => ({ id: s.id, type: s.type, date: s.date }));
    } catch (err) {
      return [];
    }
  });

  /** Sessions whose submission window is open right now. */
  app.get("/api/sessions/open", async () => {
    const now = new Date();
    const sessions = await prisma.session.findMany({
      where: {
        submissionsOpenAt: { lte: now },
        submissionsCloseAt: { gte: now },
        status: "SCHEDULED",
      },
      orderBy: { date: "asc" },
    });
    return sessions.map((s) => ({ id: s.id, type: s.type, date: s.date }));
  });

  // --- Submissions ----------------------------------------------------------------

  const handleSubmission = async (
    req: FastifyRequest,
    reply: FastifyReply,
    kind: "TOURNAMENT" | "CASH",
  ) => {
    const user = await verifiedUser(req);
    if (!user) return reply.code(401).send({ error: "Sign in with a verified account first." });
    const profile = await prisma.profile.findUnique({ where: { userId: user.id } });
    if (!profile?.nickname) {
      return reply.code(403).send({ error: "Pick your nickname before submitting results." });
    }
    if (profile.suspendedAt !== null) {
      return reply.code(403).send({ error: "Your account is suspended — speak to the committee." });
    }

    const parsed = (kind === "TOURNAMENT" ? TournamentSubmission : CashSubmission).safeParse(
      req.body,
    );
    if (!parsed.success) return reply.code(400).send({ error: "Check the form — something's off." });
    const body = parsed.data;

    const session = await prisma.session.findUnique({
      where: { id: body.sessionId },
      include: { series: { include: { pointsScheme: true } } },
    });
    if (!session || session.status !== "SCHEDULED" || session.type !== kind) {
      return reply.code(404).send({ error: "That session doesn't exist." });
    }
    const now = new Date();
    if (now < session.submissionsOpenAt || now > session.submissionsCloseAt) {
      return reply
        .code(403)
        .send({ error: "Submissions are open 17:00–23:59 on the session day." });
    }
    if (body.code.trim().toUpperCase() !== session.code.toUpperCase()) {
      return reply.code(403).send({
        error: "That code doesn't match tonight's session. Ask whoever's running tonight.",
      });
    }

    let data: Record<string, unknown>;
    if (kind === "TOURNAMENT") {
      const b = body as z.infer<typeof TournamentSubmission>;
      if (b.finishingPosition > b.entrantCount) {
        return reply
          .code(400)
          .send({ error: "Finishing position can't be higher than the number of entrants." });
      }
      const formula = await getTournamentFormula();
      const points = calculateTournamentPoints(b.finishingPosition, b.entrantCount, formula);
      data = {
        finishingPosition: b.finishingPosition,
        entrantCount: b.entrantCount,
        points,
      };
    } else {
      const b = body as z.infer<typeof CashSubmission>;
      data = {
        buyInChips: b.buyInChips,
        cashOutChips: b.cashOutChips,
        netChips: b.cashOutChips - b.buyInChips,
      };
    }

    try {
      const submission = await prisma.sessionEntry.create({
        data: { sessionId: session.id, userId: user.id, ...data },
      });
      return { ok: true, submission: { id: submission.id, ...data } };
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        return reply
          .code(409)
          .send({ error: "You've already submitted for this session — one each, dealer's rules." });
      }
      throw err;
    }
  };

  const submitRateLimit = { config: { rateLimit: { max: 15, timeWindow: "1 minute" } } };
  app.post("/api/submissions/tournament", submitRateLimit, (req, reply) =>
    handleSubmission(req, reply, "TOURNAMENT"),
  );
  app.post("/api/submissions/cash", submitRateLimit, (req, reply) =>
    handleSubmission(req, reply, "CASH"),
  );

  // --- Leaderboards ----------------------------------------------------------------

  const seasonFilter = async (seasonId: string | undefined) => {
    if (seasonId === "all") return {};
    const series = seasonId
      ? await prisma.series.findUnique({ where: { id: seasonId } })
      : await ensureActiveSeason();
    return series ? { session: { seriesId: series.id } } : {};
  };

  app.get("/api/leaderboards/tournament", async (req) => {
    const { seasonId } = req.query as { seasonId?: string };
    const where = {
      voidedAt: null,
      points: { not: null },
      session: { type: "TOURNAMENT" as const },
      ...(await seasonFilter(seasonId)),
    };
    const submissions = await prisma.sessionEntry.findMany({
      where,
      include: { user: { include: { profile: true } } },
    });

    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const byUser = new Map<
      string,
      {
        nickname: string;
        avatarId: string;
        points: number;
        pointsLastWeek: number;
        bestFinish: number;
        sessions: number;
      }
    >();
    for (const sub of submissions) {
      const nickname = sub.user.profile?.nickname ?? "—";
      const entry = byUser.get(sub.userId) ?? {
        nickname,
        avatarId: sub.user.profile?.avatarId ?? "spade-ember",
        points: 0,
        pointsLastWeek: 0,
        bestFinish: Number.MAX_SAFE_INTEGER,
        sessions: 0,
      };
      entry.points += sub.points ?? 0;
      if (sub.createdAt < weekAgo) entry.pointsLastWeek += sub.points ?? 0;
      entry.bestFinish = Math.min(entry.bestFinish, sub.finishingPosition ?? 999);
      entry.sessions += 1;
      byUser.set(sub.userId, entry);
    }

    const rank = (list: Array<[string, (typeof byUser extends Map<string, infer V> ? V : never)]>, key: "points" | "pointsLastWeek") =>
      [...list].sort(
        (a, b) => b[1][key] - a[1][key] || a[1].bestFinish - b[1].bestFinish,
      );

    const entries = [...byUser.entries()];
    const nowRanked = rank(entries, "points");
    const thenRanked = rank(entries, "pointsLastWeek");
    const thenIndex = new Map(thenRanked.map(([id], i) => [id, i]));

    return nowRanked.map(([userId, e], i) => ({
      rank: i + 1,
      nickname: e.nickname,
      avatarId: e.avatarId,
      points: e.points,
      bestFinish: e.bestFinish === Number.MAX_SAFE_INTEGER ? null : e.bestFinish,
      sessions: e.sessions,
      movement: (thenIndex.get(userId) ?? i) - i,
    }));
  });

  app.get("/api/leaderboards/cash", async (req) => {
    const { seasonId } = req.query as { seasonId?: string };
    const where = {
      voidedAt: null,
      netChips: { not: null },
      session: { type: "CASH" as const },
      ...(await seasonFilter(seasonId)),
    };
    const submissions = await prisma.sessionEntry.findMany({
      where,
      include: { user: { include: { profile: true } } },
    });

    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const byUser = new Map<
      string,
      {
        nickname: string;
        avatarId: string;
        net: number;
        netLastWeek: number;
        sessions: number;
        biggestNight: number;
      }
    >();
    for (const sub of submissions) {
      const entry = byUser.get(sub.userId) ?? {
        nickname: sub.user.profile?.nickname ?? "—",
        avatarId: sub.user.profile?.avatarId ?? "spade-ember",
        net: 0,
        netLastWeek: 0,
        sessions: 0,
        biggestNight: Number.MIN_SAFE_INTEGER,
      };
      entry.net += sub.netChips ?? 0;
      if (sub.createdAt < weekAgo) entry.netLastWeek += sub.netChips ?? 0;
      entry.sessions += 1;
      entry.biggestNight = Math.max(entry.biggestNight, sub.netChips ?? 0);
      byUser.set(sub.userId, entry);
    }

    const entries = [...byUser.entries()];
    const sortNow = [...entries].sort(
      (a, b) =>
        b[1].net - a[1].net || b[1].sessions - a[1].sessions || b[1].biggestNight - a[1].biggestNight,
    );
    const sortThen = [...entries].sort((a, b) => b[1].netLastWeek - a[1].netLastWeek);
    const thenIndex = new Map(sortThen.map(([id], i) => [id, i]));

    return sortNow.map(([userId, e], i) => ({
      rank: i + 1,
      nickname: e.nickname,
      avatarId: e.avatarId,
      net: e.net,
      sessions: e.sessions,
      biggestNight: e.biggestNight === Number.MIN_SAFE_INTEGER ? null : e.biggestNight,
      movement: (thenIndex.get(userId) ?? i) - i,
    }));
  });

  app.get("/api/leaderboards/elo", async () => {
    const profiles = await prisma.profile.findMany({
      where: { ratedHands: { gte: ELO.minHandsForBoard }, nickname: { not: null } },
      orderBy: { elo: "desc" },
      take: 100,
    });
    const season = await ensureActiveSeason();
    // Biggest climbers this season: sum of Elo deltas since the season start.
    const climbs = await prisma.eloHistory.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: season.startsAt } },
      _sum: { delta: true },
    });
    const climbMap = new Map(climbs.map((c) => [c.userId, c._sum.delta ?? 0]));
    const climberIds = [...climbMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);
    const climberProfiles = await prisma.profile.findMany({
      where: { userId: { in: climberIds }, nickname: { not: null } },
    });
    const climberByUser = new Map(climberProfiles.map((p) => [p.userId, p]));

    return {
      entries: profiles.map((p, i) => ({
        rank: i + 1,
        nickname: p.nickname,
        avatarId: p.avatarId,
        elo: Math.round(p.elo),
        ratedHands: p.ratedHands,
        provisional: p.ratedHands < ELO.provisionalHands,
      })),
      climbers: climberIds
        .filter((id) => climberByUser.has(id))
        .map((id) => ({
          nickname: climberByUser.get(id)!.nickname,
          climb: Math.round(climbMap.get(id) ?? 0),
        })),
    };
  });

  app.post("/api/sessions/:id/signin", async (req, reply) => {
    const user = await verifiedUser(req);
    if (!user) return reply.code(401).send({ error: "Sign in first." });
    const { id } = req.params as { id: string };
    const body = z.object({ nickname: z.string().min(1).max(32) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Bad sign-in request." });
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session || session.status !== "OPEN") return reply.code(404).send({ error: "Session not open." });
    const profile = await prisma.profile.findUnique({ where: { userId: user.id } });
    if (!profile?.nickname) return reply.code(403).send({ error: "Pick your nickname first." });
    await prisma.sessionEntry.upsert({
      where: { sessionId_userId: { sessionId: id, userId: user.id } },
      update: { signInTime: new Date(), voidedAt: null },
      create: { sessionId: id, userId: user.id, signInTime: new Date() },
    });
    return { ok: true };
  });

  app.post("/api/sessions/:id/signout", async (req, reply) => {
    const user = await verifiedUser(req);
    if (!user) return reply.code(401).send({ error: "Sign in first." });
    const { id } = req.params as { id: string };
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session || session.status === "CREATED" || session.status === "ARCHIVED") return reply.code(404).send({ error: "Session not active." });
    const submission = await prisma.sessionEntry.findUnique({ where: { sessionId_userId: { sessionId: id, userId: user.id } } });
    if (!submission) return reply.code(404).send({ error: "You are not signed in." });
    const formula = await getTournamentFormula();
    const approxPoints = calculateTournamentPoints(1, Math.max(1, submission.entrantCount ?? 1), formula);
    await prisma.sessionEntry.update({ where: { sessionId_userId: { sessionId: id, userId: user.id } }, data: { signOutTime: new Date() } });
    const entries = await prisma.sessionEntry.findMany({ where: { sessionId: id } });
    const streakBase = formula.STREAK_BASE;
    const byUser = new Map<string, Array<{ signedOut: boolean; dnf: boolean }>>();
    for (const entry of entries) {
      const existing = byUser.get(entry.userId) ?? [];
      existing.push({ signedOut: Boolean(entry.signOutTime), dnf: entry.finishingPosition === 999_999 });
      byUser.set(entry.userId, existing);
    }
    for (const [userId, sessions] of byUser) {
      let current = 0;
      let longest = 0;
      for (const session of sessions) {
        if (session.signedOut && !session.dnf) {
          current += 1;
          longest = Math.max(longest, current);
        } else {
          current = 0;
        }
      }
      await prisma.streak.upsert({
        where: { playerId_seriesId: { playerId: userId, seriesId: session.seriesId } },
        update: { currentStreak: current, longestStreak: longest, streakBonus: longest > 0 ? streakBase * longest : 0 },
        create: { playerId: userId, seriesId: session.seriesId, currentStreak: current, longestStreak: longest, streakBonus: longest > 0 ? streakBase * longest : 0 },
      });
    }
    return { ok: true, approxPoints };
  });

  app.get("/api/sessions/:id/entries", async (req) => {
    const { id } = req.params as { id: string };
    const entries = await prisma.sessionEntry.findMany({
      where: { sessionId: id },
      include: { user: { include: { profile: true } } },
      orderBy: { signInTime: "asc" },
    });
    return entries.map((entry) => ({
      id: entry.id,
      nickname: entry.user.profile?.nickname ?? entry.user.email,
      signedIn: Boolean(entry.signInTime),
      signedOut: Boolean(entry.signOutTime),
      finishingPosition: entry.finishingPosition,
      points: entry.points,
      dnf: entry.finishingPosition === 999_999,
    }));
  });

  app.get("/api/hall-of-fame", async () => {
    const entries = await prisma.hallOfFameEntry.findMany({
      include: { series: true },
      orderBy: { series: { startsAt: "desc" } },
    });
    return entries.map((e) => ({
      season: e.series.name,
      board: e.board,
      nickname: e.nickname,
      value: e.value,
    }));
  });

  // --- Profile extras ---------------------------------------------------------------

  app.get("/api/profile/elo-history", async (req, reply) => {
    const user = await verifiedUser(req);
    if (!user) return reply.code(401).send({ error: "Sign in first." });
    const history = await prisma.eloHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return history.reverse().map((h) => ({ rating: Math.round(h.ratingAfter), at: h.createdAt }));
  });

  app.patch("/api/profile/settings", async (req, reply) => {
    const user = await verifiedUser(req);
    if (!user) return reply.code(401).send({ error: "Sign in first." });
    const parsed = SettingsBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid settings." });
    const profile = await prisma.profile.findUnique({ where: { userId: user.id } });
    if (!profile) return reply.code(404).send({ error: "Finish onboarding first." });
    const settings = { ...(profile.settings as Record<string, unknown>), ...parsed.data };
    await prisma.profile.update({ where: { userId: user.id }, data: { settings } });
    return { ok: true, settings };
  });

  // --- Daily bonus -------------------------------------------------------------------

  app.post("/api/bonus/claim", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = await verifiedUser(req);
    if (!user) return reply.code(401).send({ error: "Sign in first." });
    const profile = await prisma.profile.findUnique({ where: { userId: user.id } });
    if (!profile) return reply.code(404).send({ error: "Finish onboarding first." });

    const todayMidnight = londonMidnight(new Date());
    if (profile.lastDailyBonusAt && profile.lastDailyBonusAt >= todayMidnight) {
      return reply.code(409).send({ error: "Today's bonus is already in your stack." });
    }
    await prisma.profile.update({
      where: { userId: user.id },
      data: { lastDailyBonusAt: new Date() },
    });
    await hydrateBankroll(user.id);
    const bankroll = adjustBankroll(user.id, BANKROLL.dailyBonus);
    return { ok: true, bankroll, bonus: BANKROLL.dailyBonus };
  });

  app.get("/api/bankroll", async (req, reply) => {
    const user = await verifiedUser(req);
    if (!user) return reply.code(401).send({ error: "Sign in first." });
    const bankroll = await hydrateBankroll(user.id);
    const profile = await prisma.profile.findUnique({ where: { userId: user.id } });
    const todayMidnight = londonMidnight(new Date());
    return {
      bankroll,
      bonusAvailable: !profile?.lastDailyBonusAt || profile.lastDailyBonusAt < todayMidnight,
    };
  });

  // --- Dev/test helpers (never in production) -------------------------------------------

  if (!isProd) {
    /** Ensure a session exists for today with an open window; returns its code. */
    app.post("/api/dev/ensure-test-session", async () => {
      const season = await ensureActiveSeason();
      const today = londonMidnight(new Date());
      const parts = londonParts(today);
      const session = await prisma.session.upsert({
        where: {
          seriesId_date_type: { seriesId: season.id, date: today, type: "TOURNAMENT" },
        },
        create: {
          seriesId: season.id,
          date: today,
          type: "TOURNAMENT",
          code: generateSessionCode(),
          submissionsOpenAt: new Date(Date.now() - 3_600_000),
          submissionsCloseAt: londonToUtc(parts.year, parts.month, parts.day, 23, 59, 59),
        },
        update: {
          submissionsOpenAt: new Date(Date.now() - 3_600_000),
          submissionsCloseAt: londonToUtc(parts.year, parts.month, parts.day, 23, 59, 59),
          status: "SCHEDULED",
        },
      });
      return { id: session.id, code: session.code, type: session.type };
    });
    void addLondonDays; // referenced by future admin tooling
  }
}
