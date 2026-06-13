import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AVATAR_IDS, BANKROLL, validateNickname } from "@uos-poker/shared";
import { auth, sessionFromHeaders } from "./auth";
import { prisma } from "./db";
import { env, isProd } from "./env";
import { readDevMailbox } from "./email/mailer";

/** Convert a Fastify request to a Fetch Request for Better Auth. */
async function betterAuthHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const url = new URL(req.raw.url ?? "/", env.BETTER_AUTH_URL ?? `http://localhost:${env.PORT}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const request = new Request(url.toString(), {
    method: req.method,
    headers,
    ...(req.body ? { body: JSON.stringify(req.body) } : {}),
  });
  const response = await auth.handler(request);

  reply.status(response.status);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") reply.header(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header("set-cookie", cookies);
  reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
}

const ProfileBody = z.object({
  nickname: z.string().min(1).max(32),
  avatarId: z.enum(AVATAR_IDS).optional(),
});

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  // Better Auth — all auth flows live under /api/auth/*.
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: betterAuthHandler,
  });

  app.get("/api/config", async () => ({
    googleEnabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  }));

  app.get("/api/me", async (req) => {
    const session = await sessionFromHeaders({ cookie: req.headers.cookie });
    if (!session?.user) return { user: null, profile: null };
    const profile = await prisma.profile.findUnique({ where: { userId: session.user.id } });
    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        emailVerified: session.user.emailVerified,
        role: (session.user as { role?: string }).role ?? "USER",
      },
      profile: profile
        ? {
            nickname: profile.nickname,
            avatarId: profile.avatarId,
            bankroll: profile.bankroll,
            elo: Math.round(profile.elo),
            ratedHands: profile.ratedHands,
            settings: profile.settings,
          }
        : null,
    };
  });

  // Create or rename the profile nickname (onboarding + profile page).
  app.post("/api/profile", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const session = await sessionFromHeaders({ cookie: req.headers.cookie });
    if (!session?.user) {
      return reply.code(401).send({ error: "Sign in first." });
    }
    if (!session.user.emailVerified) {
      return reply.code(403).send({ error: "Verify your email before choosing a nickname." });
    }
    const parsed = ProfileBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request." });
    }
    const nickname = parsed.data.nickname.trim();
    const verdict = validateNickname(nickname);
    if (!verdict.ok) {
      const messages: Record<string, string> = {
        length: "Nicknames are 3–16 characters.",
        charset: "Letters, numbers, _ and - only.",
        profanity: "Keep it clean — pick something else.",
        impersonation: "That name's reserved. Pick something else.",
      };
      return reply.code(400).send({ error: messages[verdict.reason] });
    }
    try {
      const profile = await prisma.profile.upsert({
        where: { userId: session.user.id },
        create: {
          userId: session.user.id,
          nickname,
          bankroll: BANKROLL.starting,
          ...(parsed.data.avatarId ? { avatarId: parsed.data.avatarId } : {}),
        },
        update: {
          nickname,
          ...(parsed.data.avatarId ? { avatarId: parsed.data.avatarId } : {}),
        },
      });
      return { ok: true, nickname: profile.nickname };
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        return reply.code(409).send({ error: "That nickname's taken — try another." });
      }
      throw err;
    }
  });

  // Dev-only mailbox so tests and local flows can follow email links.
  if (!isProd) {
    app.get("/api/dev/mailbox", async (req) => {
      const { to } = req.query as { to?: string };
      return readDevMailbox(to);
    });
  }
}
