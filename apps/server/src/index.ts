import { buildServer } from "./server";
import { attachRealtime, type HandshakeInfo } from "./realtime/sockets";
import { DEFAULT_TIMING, type TableTiming } from "./realtime/table";
import { devResolveUser, hydrateBankroll, type UserCtx } from "./realtime/users";
import { sessionFromHeaders } from "./auth";
import { prisma } from "./db";
import { env, isProd } from "./env";

const app = await buildServer();

/**
 * Socket identity: authenticated session first (verified email + completed
 * nickname onboarding required to play); dev nickname door as a non-prod
 * fallback so local play and E2E stay frictionless.
 */
async function resolveSocketUser(handshake: HandshakeInfo): Promise<UserCtx | null> {
  try {
    const session = await sessionFromHeaders({ cookie: handshake.headers.cookie });
    if (session?.user && session.user.emailVerified) {
      const profile = await prisma.profile.findUnique({ where: { userId: session.user.id } });
      if (profile?.nickname) {
        await hydrateBankroll(session.user.id);
        return {
          userId: session.user.id,
          nickname: profile.nickname,
          avatarId: profile.avatarId,
        };
      }
    }
  } catch (err) {
    app.log.warn({ err }, "socket session resolution failed");
  }
  if (!isProd) return devResolveUser(handshake.auth);
  return null;
}

/** UOS_FAST_TABLES=1 shortens all table clocks — dev & E2E only. */
const fastTiming: TableTiming = {
  ...DEFAULT_TIMING,
  actionMs: 4_000,
  timeBankMs: 2_000,
  botDelayMinMs: 150,
  botDelayMaxMs: 500,
  runoutBeatMs: 300,
  showdownBeatMs: 200,
  payoutBeatMs: 300,
  interHandMs: 800,
};

const realtime = attachRealtime(app.server, {
  corsOrigin: isProd ? env.SITE_URL : true,
  resolveUser: resolveSocketUser,
  ...(process.env.UOS_FAST_TABLES && !isProd ? { timing: fastTiming } : {}),
});

app.addHook("onClose", async () => {
  realtime.lobby.stop();
  await realtime.io.close();
});

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`UOS Poker server listening on :${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
