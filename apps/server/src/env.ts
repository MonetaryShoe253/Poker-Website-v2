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
  ADMIN_BOOTSTRAP_PASSWORD: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
export const isProd = env.NODE_ENV === "production";

/**
 * Fail-loud production guard. The schema above carries dev-friendly defaults so
 * local/test boots are frictionless — but those defaults are dangerous in
 * production (a known auth secret allows session forgery; localhost URLs break
 * auth/CORS). Refuse to start rather than boot insecurely or half-working.
 */
if (isProd) {
  const problems: string[] = [];
  const DEV_SECRET_DEFAULT = "dev-secret-change-me";
  const looksLocal = (url: string | undefined) =>
    !url || /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url) || !/^https?:\/\//.test(url);

  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET === DEV_SECRET_DEFAULT) {
    problems.push(
      'BETTER_AUTH_SECRET is missing or set to the insecure default. Generate one: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"',
    );
  } else if (env.BETTER_AUTH_SECRET.length < 32) {
    problems.push("BETTER_AUTH_SECRET is too short — use at least 32 characters of entropy.");
  }
  if (looksLocal(env.SITE_URL)) {
    problems.push(`SITE_URL must be your public https URL (got: ${env.SITE_URL || "unset"}).`);
  }
  if (looksLocal(env.BETTER_AUTH_URL)) {
    problems.push(
      `BETTER_AUTH_URL must be your public https URL (got: ${env.BETTER_AUTH_URL || "unset"}).`,
    );
  }
  // Email verification is mandatory, so email sign-up is dead without a working
  // Resend config — refuse to boot half-working rather than fail silently later.
  if (!env.RESEND_API_KEY) {
    problems.push(
      "RESEND_API_KEY is not set — verification/reset emails cannot send. Create a key at https://resend.com/api-keys.",
    );
  }
  const fromDomain = env.EMAIL_FROM.match(/@([^>\s]+)/)?.[1];
  if (!fromDomain || fromDomain === "example.com" || fromDomain.endsWith(".example")) {
    problems.push(
      `EMAIL_FROM is unset or still a placeholder (got: ${env.EMAIL_FROM}). Set it to a verified Resend sending domain, e.g. "UOS Poker <noreply@uospoker.co.uk>".`,
    );
  }

  if (problems.length > 0) {
    console.error(
      "\n[FATAL] Refusing to start in production with insecure configuration:\n" +
        problems.map((p) => `  • ${p}`).join("\n") +
        "\n\nSet these environment variables on the deployment service and redeploy.\n",
    );
    process.exit(1);
  }
}
