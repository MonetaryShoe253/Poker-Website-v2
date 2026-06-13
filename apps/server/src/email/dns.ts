import { env, isProd } from "../env";

/**
 * Prints the DNS records Kiran must add at the registrar so Resend can send
 * from the society domain. The DKIM public key is generated per-domain by
 * Resend and shown in their dashboard — we can't know it here, so we point
 * to it rather than fabricate one. SPF/DMARC are standard and printed in full.
 */
export function printResendDnsRecords(): void {
  // Domain from EMAIL_FROM ("UOS Poker <noreply@uospoker.example>") or env.
  const fromMatch = env.EMAIL_FROM.match(/@([^>\s]+)/);
  const domain = fromMatch?.[1];
  if (!domain || domain.endsWith(".example") || domain.includes("localhost")) {
    if (isProd && !env.RESEND_API_KEY) {
      console.warn(
        "[email] No real EMAIL_FROM domain / RESEND_API_KEY set — emails will not send in production.",
      );
    }
    return;
  }
  if (!isProd) return;

  const lines = [
    "",
    "──────────────────────────────────────────────────────────────",
    ` Resend DNS records for ${domain}`,
    " Add these at your DNS registrar, then verify the domain in Resend.",
    "──────────────────────────────────────────────────────────────",
    ` MX     send.${domain}            feedback-smtp.eu-west-1.amazonses.com   (priority 10)`,
    ` TXT    send.${domain}            "v=spf1 include:amazonses.com ~all"`,
    ` TXT    resend._domainkey.${domain}   <DKIM key from the Resend dashboard>`,
    ` TXT    _dmarc.${domain}          "v=DMARC1; p=none;"`,
    "──────────────────────────────────────────────────────────────",
    " The DKIM value is unique to your domain — copy it from",
    " https://resend.com/domains after adding the domain there.",
    " (MX region shown is eu-west-1; use whatever region Resend assigns you.)",
    "──────────────────────────────────────────────────────────────",
    "",
  ];
  console.log(lines.join("\n"));
}
