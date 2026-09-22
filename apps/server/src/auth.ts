import { betterAuth, type User } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { env } from "./env";
import { sendEmail } from "./email/mailer";
import { VerificationEmail } from "./email/templates/VerificationEmail";
import { WelcomeEmail } from "./email/templates/WelcomeEmail";
import { PasswordResetEmail } from "./email/templates/PasswordResetEmail";

/**
 * Better Auth: email+password with mandatory verification, password reset,
 * and Google OAuth. Sessions live in Postgres; httpOnly cookies. The first
 * account whose email matches ADMIN_EMAIL is auto-promoted to admin.
 */

async function sendWelcomeOnce(user: { id: string; email: string; name?: string | null }) {
  const row = await prisma.user.findUnique({ where: { id: user.id } });
  if (!row || row.welcomedAt) return;
  await prisma.user.update({ where: { id: user.id }, data: { welcomedAt: new Date() } });
  await sendEmail({
    to: user.email,
    subject: "You're in: welcome to UOS Poker",
    react: WelcomeEmail({
      name: user.name ?? "",
      siteUrl: env.SITE_URL,
      nextSession: null,
    }),
  });
}

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL ?? `http://localhost:${env.PORT}`,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.SITE_URL],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  advanced: {
    // HTTPS in production (Railway) → Secure cookies; httpOnly is default.
    useSecureCookies: env.NODE_ENV === "production",
    defaultCookieAttributes: { sameSite: "lax" },
  },
  session: {
    modelName: "authSession",
  },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "USER", input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your UOS Poker password",
        react: PasswordResetEmail({ name: user.name ?? "", url }),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Your seat is reserved: confirm your email",
        react: VerificationEmail({ name: user.name ?? "", url }),
      });
    },
    afterEmailVerification: async (user: User) => {
      await sendWelcomeOnce(user);
    },
  },
  socialProviders:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {},
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Auto-promote the configured admin account.
          if (env.ADMIN_EMAIL && user.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase()) {
            await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
          }
          // Every account gets a linked Player — the tournament/kiosk identity.
          // Registering online ahead of a session is what makes them
          // findable at the kiosk without a separate in-person signup.
          // If a guest Player already claimed this email at a kiosk, link it.
          await prisma.player.upsert({
            where: { email: user.email },
            update: { userId: user.id },
            create: {
              email: user.email,
              displayName: user.name?.trim() || user.email.split("@")[0] || user.email,
              userId: user.id,
            },
          });
          // OAuth signups arrive pre-verified → welcome them now.
          if (user.emailVerified) {
            await sendWelcomeOnce(user);
          }
        },
      },
    },
  },
});

export type AuthSessionData = Awaited<ReturnType<typeof auth.api.getSession>>;

/**
 * Guarantees a working admin login exists the moment a fresh deploy comes up,
 * rather than depending on someone signing up and clicking a verification
 * email first. Opt-in via ADMIN_EMAIL + ADMIN_BOOTSTRAP_PASSWORD; a no-op if
 * either is unset, or if that email already has an account (never touches an
 * existing account's password — this only ever creates the very first one).
 * Goes through the real sign-up endpoint so it gets the same
 * hashing/validation/databaseHooks (role auto-promotion, linked Player row)
 * as any other signup — the one deliberate shortcut is marking the email
 * verified immediately, since these credentials came from a trusted
 * deploy-only env var, not an inbox a stranger controls.
 */
export async function ensureBootstrapAdmin(port: number): Promise<void> {
  if (!env.ADMIN_EMAIL || !env.ADMIN_BOOTSTRAP_PASSWORD) return;
  const existing = await prisma.user.findUnique({ where: { email: env.ADMIN_EMAIL } });
  if (existing) return;
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: env.SITE_URL },
    body: JSON.stringify({
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_BOOTSTRAP_PASSWORD,
      name: "Admin",
    }),
  });
  if (!res.ok) {
    console.error("[bootstrap] failed to create the seed admin account:", await res.text());
    return;
  }
  await prisma.user.update({ where: { email: env.ADMIN_EMAIL }, data: { emailVerified: true } });
  console.log(`[bootstrap] seed admin account ready: ${env.ADMIN_EMAIL}`);
}

/** Resolve a session from raw request headers (REST and socket handshakes). */
export async function sessionFromHeaders(rawHeaders: {
  cookie?: string | undefined;
}): Promise<AuthSessionData> {
  const headers = new Headers();
  if (rawHeaders.cookie) headers.set("cookie", rawHeaders.cookie);
  return auth.api.getSession({ headers });
}
