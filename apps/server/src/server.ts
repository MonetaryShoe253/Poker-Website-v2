import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import { env, isProd } from "./env";
import { registerApiRoutes } from "./routes";
import { registerGameRoutes } from "./routes-game";
import { registerAdminRoutes } from "./routes-admin";

export async function buildServer() {
  const isTest = env.NODE_ENV === "test" || process.env.VITEST !== undefined;
  const app = Fastify({
    logger: isTest
      ? { level: "warn" }
      : {
          level: isProd ? "info" : "debug",
          transport: isProd ? undefined : { target: "pino-pretty", options: { colorize: true } },
        },
  });

  await app.register(helmet, {
    // SPA is same-origin in prod. style-src needs 'unsafe-inline' (React/
    // Framer inline styles); img/font use data: URIs; the Society map is a
    // Google Maps iframe; connect-src allows same-origin WS for Socket.IO.
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "data:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            frameSrc: ["https://www.google.com", "https://maps.google.com"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, {
    origin: isProd ? env.SITE_URL : true,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    max: 200,
    timeWindow: "1 minute",
  });

  app.get("/healthz", async () => ({ ok: true, uptime: process.uptime() }));

  await registerApiRoutes(app);
  await registerGameRoutes(app);
  await registerAdminRoutes(app);

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
