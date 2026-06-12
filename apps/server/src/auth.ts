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
    subject: "You're in — welcome to UOS Poker",
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
        subject: "Your seat is reserved — confirm your email",
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

/** Resolve a session from raw request headers (REST and socket handshakes). */
export async function sessionFromHeaders(rawHeaders: {
  cookie?: string | undefined;
}): Promise<AuthSessionData> {
  const headers = new Headers();
  if (rawHeaders.cookie) headers.set("cookie", rawHeaders.cookie);
  return auth.api.getSession({ headers });
}
