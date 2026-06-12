import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import { env, isProd } from "./env";

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: isProd ? "info" : "debug",
      transport: isProd ? undefined : { target: "pino-pretty", options: { colorize: true } },
    },
  });

  await app.register(helmet, {
    // The SPA is same-origin in prod; CSP is finalised in the hardening phase.
    contentSecurityPolicy: false,
  });
  await app.register(cors, {
    origin: isProd ? env.SITE_URL : true,
    credentials: true,
  });
  await app.register(cookie);

  app.get("/healthz", async () => ({ ok: true, uptime: process.uptime() }));

  // In production the server serves the built SPA.
  const webDist = path.resolve(import.meta.dirname, "../../web/dist");
  if (isProd && fs.existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith("/api") || req.raw.url?.startsWith("/socket.io")) {
        return reply.code(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
