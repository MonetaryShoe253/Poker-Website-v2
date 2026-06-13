/** Live realtime stats bridge — set by index.ts, read by admin routes. */
export interface LiveStats {
  tables: number;
  seatedHumans: number;
  clients: number;
}

let provider: (() => LiveStats) | null = null;

export function setLiveStatsProvider(fn: () => LiveStats): void {
  provider = fn;
}

export function getLiveStats(): LiveStats {
  return provider?.() ?? { tables: 0, seatedHumans: 0, clients: 0 };
}
