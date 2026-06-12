import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { authClient } from "../lib/auth";

const inputClass =
  "w-full rounded border border-steel bg-bg-0 px-3 py-2 text-text outline-none focus:border-ember";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const request = async () => {
    setError(null);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setError(error.message ?? "Couldn't send the email — try again.");
    else setDone(true);
  };

  const confirm = async () => {
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token: token! });
    if (error) setError(error.message ?? "That link has expired — request a fresh one.");
    else navigate("/auth");
  };

  return (
    <section className="mx-auto max-w-sm px-4 py-20">
      <h1 className="text-center font-display text-3xl font-semibold tracking-[0.12em]">
        RESET PASSWORD
      </h1>
      <div className="panel-steel mt-6 rounded-lg p-6">
        {token ? (
          <>
            <input
              className={inputClass}
              type="password"
              placeholder="New password (8+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="mt-2 text-sm text-ember">{error}</p>}
            <button
              className="mt-4 w-full rounded bg-ember-deep px-4 py-2.5 font-display text-white hover:bg-ember"
              onClick={() => void confirm()}
            >
              Set new password
            </button>
          </>
        ) : done ? (
          <p className="text-sm text-muted">
            If that address has an account, a reset link is on its way. Check your inbox.
          </p>
        ) : (
          <>
            <input
              className={inputClass}
              type="email"
              placeholder="Your account email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error && <p className="mt-2 text-sm text-ember">{error}</p>}
            <button
              className="mt-4 w-full rounded bg-ember-deep px-4 py-2.5 font-display text-white hover:bg-ember"
              onClick={() => void request()}
            >
              Send reset link
            </button>
          </>
        )}
      </div>
    </section>
  );
}
