import { ELO } from "./constants";

/**
 * Per-hand pairwise Elo (§14 of the brief).
 *
 * For each completed rated hand with n dealt-in participants and net_i the
 * chip delta of participant i:
 *   - every unordered pair (i, j): S_i = 1 if net_i > net_j, 0.5 if equal, 0 otherwise
 *   - E_i = 1 / (1 + 10^((R_j − R_i)/400))
 *   - ΔR_i += (K_i / (n − 1)) · (S_i − E_i)
 *
 * Humans: K=24 for the first 30 rated hands (provisional), then K=8.
 * Bots are immovable anchors: they influence opponents but never move.
 * Ratings floor at 100.
 */

export interface EloParticipant {
  id: string;
  rating: number;
  net: number;
  /** Bots: rating never changes. */
  anchored: boolean;
  /** Rated hands completed before this one (drives provisional K). */
  ratedHands: number;
}

export function kFactorFor(ratedHands: number): number {
  return ratedHands < ELO.provisionalHands ? ELO.kProvisional : ELO.kStandard;
}

export function computeEloDeltas(participants: EloParticipant[]): Map<string, number> {
  const n = participants.length;
  const deltas = new Map<string, number>(participants.map((p) => [p.id, 0]));
  if (n < 2) return deltas;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = participants[i]!;
      const b = participants[j]!;
      const sA = a.net > b.net ? 1 : a.net === b.net ? 0.5 : 0;
      const sB = 1 - sA;
      const eA = 1 / (1 + 10 ** ((b.rating - a.rating) / 400));
      const eB = 1 - eA;
      if (!a.anchored) {
        deltas.set(a.id, deltas.get(a.id)! + (kFactorFor(a.ratedHands) / (n - 1)) * (sA - eA));
      }
      if (!b.anchored) {
        deltas.set(b.id, deltas.get(b.id)! + (kFactorFor(b.ratedHands) / (n - 1)) * (sB - eB));
      }
    }
  }

  // Rating floor.
  for (const p of participants) {
    if (p.anchored) continue;
    const delta = deltas.get(p.id)!;
    if (p.rating + delta < ELO.floor) {
      deltas.set(p.id, ELO.floor - p.rating);
    }
  }
  return deltas;
}
