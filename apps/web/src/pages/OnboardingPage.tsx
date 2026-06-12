import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { invalidateMe, useMe } from "../lib/useMe";
import { resetSocket } from "../lib/socket";

export function OnboardingPage() {
  const { me, loading, refresh } = useMe();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!me?.user) {
      navigate("/auth");
      return;
    }
    if (me.profile?.nickname) {
      navigate("/play");
      return;
    }
    setNickname((current) =>
      current === "" && me.user?.name ? me.user.name.replace(/[^A-Za-z0-9_-]/g, "") : current,
    );
  }, [loading, me, navigate]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "That didn't work — try another nickname.");
        return;
      }
      invalidateMe();
      await refresh();
      resetSocket();
      navigate("/play");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-sm px-4 py-20">
      <h1 className="text-center font-display text-3xl font-semibold tracking-[0.12em]">
        PICK YOUR NAME
      </h1>
      <p className="mt-3 text-center text-sm text-muted">
        This is how you'll appear at tables and on every leaderboard. Choose well — 3–16
        characters, letters, numbers, _ or -.
      </p>
      <div className="panel-steel mt-6 rounded-lg p-6">
        <input
          className="w-full rounded border border-steel bg-bg-0 px-3 py-2 text-text outline-none focus:border-ember"
          placeholder="Nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          maxLength={16}
          autoFocus
        />
        {error && <p className="mt-2 text-sm text-ember">{error}</p>}
        <button
          className="mt-4 w-full rounded bg-ember-deep px-4 py-2.5 font-display tracking-wide text-white hover:bg-ember disabled:opacity-50"
          onClick={() => void submit()}
          disabled={busy || nickname.trim().length < 3}
        >
          Take this name
        </button>
      </div>
    </section>
  );
}
