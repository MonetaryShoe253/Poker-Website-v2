import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { authClient } from "../lib/auth";
import { invalidateMe } from "../lib/useMe";

const inputClass =
  "w-full rounded border border-steel bg-bg-0 px-3 py-2 text-text outline-none focus:border-ember";
const primaryButton =
  "w-full rounded bg-ember-deep px-4 py-2.5 font-display tracking-wide text-white hover:bg-ember disabled:opacity-50";

export function AuthPage() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(
    params.get("mode") === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void fetch("/api/config")
      .then((r) => r.json())
      .then((c: { googleEnabled: boolean }) => setGoogleEnabled(c.googleEnabled))
      .catch(() => {});
  }, []);

  const submit = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await authClient.signUp.email({
          email,
          password,
          name: nickname.trim(),
          callbackURL: `${window.location.origin}/onboarding`,
        });
        if (error) {
          setError(error.message ?? "Sign-up failed — check the details and try again.");
        } else {
          invalidateMe();
          navigate(`/check-inbox?email=${encodeURIComponent(email)}`);
        }
      } else {
        const { error } = await authClient.signIn.email({ email, password });
        if (error) {
          if (error.status === 403) {
            setNotice("Your email isn't verified yet — check your inbox for the link.");
          } else {
            setError(error.message ?? "Sign-in failed — check your email and password.");
          }
        } else {
          invalidateMe();
          navigate("/play");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}/onboarding`,
    });
  };

  return (
    <section className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-center font-display text-3xl font-semibold tracking-[0.12em]">
        {mode === "signin" ? "SIGN IN" : "PULL UP A CHAIR"}
      </h1>

      <div className="panel-steel mt-6 rounded-lg p-6">
        <div className="mb-4 flex rounded border border-steel text-center text-sm">
          <button
            className={`flex-1 rounded-l py-2 font-display ${mode === "signin" ? "bg-steel text-text" : "text-muted"}`}
            onClick={() => setMode("signin")}
          >
            Sign in
          </button>
          <button
            className={`flex-1 rounded-r py-2 font-display ${mode === "signup" ? "bg-steel text-text" : "text-muted"}`}
            onClick={() => setMode("signup")}
          >
            Create account
          </button>
        </div>

        <div className="space-y-3">
          {mode === "signup" && (
            <input
              className={inputClass}
              placeholder="Nickname (shows on leaderboards)"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={16}
            />
          )}
          <input
            className={inputClass}
            type="email"
            placeholder="University or personal email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={inputClass}
            type="password"
            placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
          />
          {error && <p className="text-sm text-ember">{error}</p>}
          {notice && <p className="text-sm text-gold">{notice}</p>}
          <button className={primaryButton} onClick={() => void submit()} disabled={busy}>
            {mode === "signin" ? "Deal me in" : "Reserve my seat"}
          </button>
          {googleEnabled && (
            <button
              className="w-full rounded border border-steel px-4 py-2.5 text-sm hover:border-ember"
              onClick={() => void google()}
            >
              Continue with Google
            </button>
          )}
        </div>

        {mode === "signin" && (
          <p className="mt-4 text-center text-sm text-muted">
            <Link to="/reset-password" className="underline hover:text-text">
              Forgotten your password?
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
