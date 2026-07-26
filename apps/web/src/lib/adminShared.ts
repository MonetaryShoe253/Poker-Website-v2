/** Shared with the AdminPage.tsx cockpit (kept file-local there too — small,
 * intentional duplication rather than risking a change to that page). */

export const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : {},
    ...init,
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Failed");
  return res.json() as Promise<T>;
};

export const btn =
  "rounded border border-steel px-2.5 py-1 text-xs hover:border-ember hover:text-ember disabled:opacity-40";
export const btnPrimary =
  "rounded bg-ember-deep px-3 py-1 font-display text-xs text-white hover:bg-ember disabled:opacity-40";
export const inputCls =
  "rounded border border-steel bg-bg-0 px-2 py-1 text-sm outline-none focus:border-ember";

export function tabButtonClass(active: boolean): string {
  return `rounded px-3 py-1.5 font-display text-xs tracking-wide ${
    active ? "bg-steel text-text" : "text-muted hover:text-text"
  }`;
}
