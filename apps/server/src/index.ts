import { buildServer } from "./server";
import { attachRealtime, type HandshakeInfo } from "./realtime/sockets";
import { DEFAULT_TIMING, type TableTiming } from "./realtime/table";
import {
  devResolveUser,
  guestResolveUser,
  hydrateBankroll,
  type UserCtx,
} from "./realtime/users";
import { sessionFromHeaders } from "./auth";
import { prisma } from "./db";
import { env, isProd } from "./env";
import { startSessionScheduler, stopSessionScheduler } from "./services/seasons";
import { persistSettlement, pruneOldHandRecords } from "./services/settlement";
import { setLiveStatsProvider } from "./realtime/stats";
import { printResendDnsRecords } from "./email/dns";

const app = await buildServer();

/**
 * Socket identity: authenticated session first (verified email + completed
 * nickname onboarding required for rated play). Failing that: the dev nickname
 * door (non-prod only, full access) or the production guest door (opt-in demo
 * identity restricted to practice + spectating). A bare unauthenticated socket
 * resolves to an anonymous spectator.
 */
async function resolveSocketUser(handshake: HandshakeInfo): Promise<UserCtx | null> {
  try {
    const session = await sessionFromHeaders({ cookie: handshake.headers.cookie });
    if (session?.user && session.user.emailVerified) {
      const profile = await prisma.profile.findUnique({ where: { userId: session.user.id } });
      // Suspended accounts fall through to anonymous spectator — they keep a
      // read-only view but can't sit, chat, or play.
      if (profile?.nickname && profile.suspendedAt === null) {
        await hydrateBankroll(session.user.id);
        const settings = profile.settings as { showLosing?: boolean } | null;
        return {
          userId: session.user.id,
          nickname: profile.nickname,
          avatarId: profile.avatarId,
          showLosing: settings?.showLosing ?? false,
          chatBanned: profile.chatBannedAt !== null,
        };
      }
    }
  } catch (err) {
    app.log.warn({ err }, "socket session resolution failed");
  }
  if (!isProd) return devResolveUser(handshake.auth);
  const guest = guestResolveUser(handshake.auth);
  if (guest) await hydrateBankroll(guest.userId);
  return guest;
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
  onHandSettled: (settlement) =>
    persistSettlement(settlement).catch((err) =>
      app.log.error({ err }, "settlement persistence failed"),
    ),
  ...(process.env.UOS_FAST_TABLES && !isProd ? { timing: fastTiming } : {}),
});

setLiveStatsProvider(() => ({
  tables: realtime.lobby.allTables().length,
  seatedHumans: realtime.lobby.allTables().reduce((sum, t) => sum + t.humanCount(), 0),
  clients: realtime.io.engine.clientsCount,
}));

startSessionScheduler();
const pruneTimer = setInterval(
  () => void pruneOldHandRecords().catch((err) => app.log.error({ err }, "prune failed")),
  6 * 60 * 60 * 1000,
);

app.addHook("onClose", async () => {
  stopSessionScheduler();
  clearInterval(pruneTimer);
  realtime.lobby.stop();
  await realtime.io.close();
});

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`UOS Poker server listening on :${env.PORT}`);
  printResendDnsRecords();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
