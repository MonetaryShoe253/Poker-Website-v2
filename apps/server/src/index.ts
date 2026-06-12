import { buildServer } from "./server";
import { env } from "./env";

const app = await buildServer();

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`UOS Poker server listening on :${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
