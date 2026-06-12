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

export function useMe(): { me: Me | null; loading: boolean; refresh: () => Promise<void> } {
  const [me, setMe] = useState<Me | null>(cached);
  const [loading, setLoading] = useState(cached === null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      const data = (await res.json()) as Me;
      cached = data;
      setMe(data);
    } catch {
      cached = { user: null, profile: null };
      setMe(cached);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cached === null) void refresh();
  }, [refresh]);

  return { me, loading, refresh };
}

export function invalidateMe(): void {
  cached = null;
}
