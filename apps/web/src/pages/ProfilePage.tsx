import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AVATAR_IDS } from "@uos-poker/shared";
import { invalidateMe, useMe } from "../lib/useMe";

interface EloPoint {
  rating: number;
  at: string;
}

function Sparkline({ points }: { points: EloPoint[] }) {
  if (points.length < 2) {
    return <p className="text-xs text-muted">Play rated hands to draw your rating history.</p>;
  }
  const ratings = points.map((p) => p.rating);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const range = Math.max(1, max - min);
  const w = 240;
  const h = 48;
  const path = ratings
    .map(
      (r, i) =>
        `${i === 0 ? "M" : "L"}${((i / (ratings.length - 1)) * w).toFixed(1)},${(
          h -
          ((r - min) / range) * h
        ).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={path} fill="none" stroke="#FF2D40" strokeWidth="1.5" />
    </svg>
  );
}

export function ProfilePage() {
  const { me, loading, refresh } = useMe();
  const [history, setHistory] = useState<EloPoint[]>([]);
  const [nickname, setNickname] = useState("");
  const [avatarId, setAvatarId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (me?.profile) {
      setNickname(me.profile.nickname ?? "");
      setAvatarId(me.profile.avatarId);
      setSettings((me.profile.settings as Record<string, boolean>) ?? {});
      void fetch("/api/profile/elo-history", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : []))
        .then(setHistory);
    }
  }, [me]);

  if (loading) return null;
  if (!me?.user) {
    return (
      <section className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-muted">Sign in to see your profile.</p>
        <Link to="/auth" className="mt-3 inline-block text-ember underline">
          Sign in
        </Link>
      </section>
    );
  }

  const saveIdentity = async () => {
    setMessage(null);
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ nickname: nickname.trim(), avatarId }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Couldn't save.");
      return;
    }
    invalidateMe();
    await refresh();
    setMessage("Saved.");
  };

  const toggleSetting = async (key: string) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    await fetch("/api/profile/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ [key]: next[key] }),
    });
  };

  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold tracking-[0.12em]">PROFILE</h1>

      <div className="panel-steel mt-6 rounded-lg p-6">
        <h2 className="font-display text-sm uppercase tracking-widest text-muted">Identity</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={16}
            className="rounded border border-steel bg-bg-0 px-3 py-2 text-text outline-none focus:border-ember"
          />
          <button
            onClick={() => void saveIdentity()}
            className="rounded bg-ember-deep px-4 py-2 font-display text-sm text-white hover:bg-ember"
          >
            Save
          </button>
          {message && <span className="text-sm text-muted">{message}</span>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {AVATAR_IDS.map((id) => (
            <button
              key={id}
              onClick={() => setAvatarId(id)}
              title={id}
              className={`h-10 w-10 rounded-full border font-display text-xs uppercase ${
                avatarId === id ? "border-ember text-ember shadow-ember" : "border-steel text-muted"
              }`}
            >
              {id.slice(0, 2)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="panel-steel rounded-lg p-6">
          <h2 className="font-display text-sm uppercase tracking-widest text-muted">Online</h2>
          <p className="tnum mt-2 text-2xl font-semibold">
            {me.profile?.elo ?? 1000}
            <span className="ml-2 text-sm font-normal text-muted">Elo</span>
            {(me.profile?.ratedHands ?? 0) < 30 && (
              <span className="ml-2 text-xs text-muted">(provisional)</span>
            )}
          </p>
          <p className="tnum text-sm text-muted">{me.profile?.ratedHands ?? 0} rated hands</p>
          <div className="mt-3">
            <Sparkline points={history} />
          </div>
          <p className="tnum mt-3 text-sm text-muted">
            Bankroll: {me.profile?.bankroll.toLocaleString()} chips
          </p>
        </div>

        <div className="panel-steel rounded-lg p-6">
          <h2 className="font-display text-sm uppercase tracking-widest text-muted">Settings</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(
              [
                ["sounds", "Table sounds"],
                ["fourColourDeck", "Four-colour deck"],
                ["autoMuck", "Auto-muck losing hands"],
                ["showLosing", "Show losing hands at showdown"],
              ] as const
            ).map(([key, label]) => (
              <li key={key} className="flex items-center justify-between">
                <span>{label}</span>
                <button
                  onClick={() => void toggleSetting(key)}
                  className={`h-6 w-11 rounded-full border transition-colors ${
                    settings[key] ? "border-ember bg-ember-deep" : "border-steel bg-bg-0"
                  }`}
                  role="switch"
                  aria-checked={settings[key] ?? false}
                  aria-label={label}
                >
                  <span
                    className={`block h-4 w-4 rounded-full bg-text transition-transform ${
                      settings[key] ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 text-center">
        <Link
          to="/submit"
          className="inline-block rounded border border-steel px-4 py-2 font-display text-sm hover:border-ember hover:text-ember"
        >
          Submit a session result
        </Link>
      </div>
    </section>
  );
}
