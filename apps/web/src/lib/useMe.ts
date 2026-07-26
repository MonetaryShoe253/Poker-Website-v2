import { useCallback, useEffect, useState } from "react";

export interface Me {
  user: {
    id: string;
    email: string;
    name: string | null;
    emailVerified: boolean;
    role: string;
  } | null;
  profile: {
    nickname: string | null;
    avatarId: string;
    bankroll: number;
    elo: number;
    ratedHands: number;
    settings: unknown;
  } | null;
}

let cached: Me | null = null;
const listeners = new Set<(me: Me) => void>();

async function fetchMe(): Promise<Me> {
  try {
    const res = await fetch("/api/me", { credentials: "include" });
    return (await res.json()) as Me;
  } catch {
    return { user: null, profile: null };
  }
}

export function useMe(): { me: Me | null; loading: boolean; refresh: () => Promise<void> } {
  const [me, setMe] = useState<Me | null>(cached);
  const [loading, setLoading] = useState(cached === null);

  const refresh = useCallback(async () => {
    const data = await fetchMe();
    cached = data;
    listeners.forEach((fn) => fn(data));
    setLoading(false);
  }, []);

  useEffect(() => {
    listeners.add(setMe);
    if (cached === null) void refresh();
    return () => {
      listeners.delete(setMe);
    };
  }, [refresh]);

  return { me, loading, refresh };
}

/** Clears the cached user and re-fetches, broadcasting the result to every
 * currently-mounted useMe() consumer — not just whichever component called
 * this. Needed because a component that triggers a sign-in/out (e.g.
 * AuthPage) is usually a different component instance than the ones that
 * need to reflect it (the nav bar's Layout/AuthMenu). */
export async function invalidateMe(): Promise<void> {
  cached = null;
  const data = await fetchMe();
  cached = data;
  listeners.forEach((fn) => fn(data));
}
