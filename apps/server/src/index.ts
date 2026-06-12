import { buildServer } from "./server";
import { attachRealtime } from "./realtime/sockets";
import { DEFAULT_TIMING, type TableTiming } from "./realtime/table";
import { env, isProd } from "./env";

const app = await buildServer();

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
