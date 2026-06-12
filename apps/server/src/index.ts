import { buildServer } from "./server";
import { attachRealtime } from "./realtime/sockets";
import { env, isProd } from "./env";

const app = await buildServer();
await app.ready();

const realtime = attachRealtime(app.server, {
  corsOrigin: isProd ? env.SITE_URL : true,
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
