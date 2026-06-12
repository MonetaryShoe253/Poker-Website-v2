import { z } from "zod";
import path from "node:path";
import fs from "node:fs";

// Load the repo-root .env in dev (Railway injects real env vars in prod).
const rootEnv = path.resolve(import.meta.dirname, "../../../.env");
if (fs.existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z
    .string()
    .default("postgresql://postgres:postgres@localhost:5433/uospoker?schema=public"),
  SITE_URL: z.string().default("http://localhost:5173"),
  BETTER_AUTH_SECRET: z.string().default("dev-secret-change-me"),
  BETTER_AUTH_URL: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("UOS Poker <noreply@example.com>"),
  ADMIN_EMAIL: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
export const isProd = env.NODE_ENV === "production";
