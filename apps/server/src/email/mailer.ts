import { render } from "@react-email/components";
import { Resend } from "resend";
import type { ReactElement } from "react";
import { env, isProd } from "../env";

/**
 * Outbound mail. With RESEND_API_KEY set, mail goes through Resend.
 * Without it (dev/test), mail is captured in an in-memory mailbox that the
 * dev-only /api/dev/mailbox route exposes — Playwright reads it to follow
 * verification links.
 */

export interface CapturedEmail {
  to: string;
  subject: string;
  html: string;
  at: number;
}

const devMailbox: CapturedEmail[] = [];

export function readDevMailbox(to?: string): CapturedEmail[] {
  return devMailbox.filter((m) => !to || m.to.toLowerCase() === to.toLowerCase());
}

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendEmail(opts: {
  to: string;
  subject: string;
  react: ReactElement;
}): Promise<void> {
  const html = await render(opts.react);
  if (resend) {
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html,
    });
    if (error) {
      // Most common causes: sending domain not verified in Resend, EMAIL_FROM
      // not on that domain, or an API key restricted to another domain.
      console.error(`[email] Resend rejected "${opts.subject}" to ${opts.to}:`, error);
      throw new Error(`Email could not be sent (${error.name ?? "resend_error"}).`);
    }
    return;
  }
  if (isProd) {
    // Unreachable when the env guard is active; kept as a fail-loud backstop.
    console.error("[email] RESEND_API_KEY missing in production — email not sent:", opts.subject);
    throw new Error("Email is not configured on this server.");
  }
  devMailbox.push({ to: opts.to, subject: opts.subject, html, at: Date.now() });
  if (devMailbox.length > 200) devMailbox.shift();
}
