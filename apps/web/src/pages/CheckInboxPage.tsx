import { useState } from "react";
import { useSearchParams } from "react-router";
import { authClient } from "../lib/auth";

export function CheckInboxPage() {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  const [resent, setResent] = useState(false);

  const resend = async () => {
    if (!email) return;
    await authClient.sendVerificationEmail({
      email,
      callbackURL: `${window.location.origin}/onboarding`,
    });
    setResent(true);
  };

  return (
    <section className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="font-display text-3xl font-semibold tracking-[0.12em]">CHECK YOUR INBOX</h1>
      <p className="mt-4 text-muted">
        Your seat is reserved{email ? ` — we've emailed ${email}` : ""}. Click the link inside to
        confirm your email and you're in.
      </p>
      <p className="mt-6 text-sm text-muted">
        Nothing arrived? Check spam, or{" "}
        <button onClick={() => void resend()} className="underline hover:text-text">
          resend the email
        </button>
        {resent && <span className="ml-2 text-gold">sent.</span>}
      </p>
    </section>
  );
}
