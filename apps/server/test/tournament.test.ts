import { describe, expect, it } from "vitest";
import { calculateTournamentPoints, deriveStreaks } from "../src/services/tournament";

describe("tournament formula", () => {
  const formula = { A: 2.5, B: 0.22, ITM_PERCENT: 0.2, STREAK_BASE: 2 };

  it("scores floor(A * N * e^(-B*p)) for finishers inside the ICM cutoff", () => {
    expect(calculateTournamentPoints(1, 30, formula)).toBe(60);
    expect(calculateTournamentPoints(3, 30, formula)).toBe(38);
    expect(calculateTournamentPoints(6, 30, formula)).toBe(20);
  });

  it("scores zero once a finisher falls outside the ICM cutoff", () => {
    // cutoff = floor(30 * 0.2) = 6
    expect(calculateTournamentPoints(7, 30, formula)).toBe(0);
    expect(calculateTournamentPoints(20, 30, formula)).toBe(0);
  });
});

describe("streak derivation", () => {
  it("resets streaks for DNFs and advances valid sign-ins and sign-outs", () => {
    const entries = [
      { userId: "u1", signedOut: true, dnf: false, sessionDate: "2024-01-01" },
      { userId: "u1", signedOut: true, dnf: false, sessionDate: "2024-01-08" },
      { userId: "u2", signedOut: false, dnf: true, sessionDate: "2024-01-01" },
    ];

    const streaks = deriveStreaks(entries, 2);
    expect(streaks).toEqual([
      { userId: "u1", currentStreak: 2, longestStreak: 2, streakBonus: 4 },
      { userId: "u2", currentStreak: 0, longestStreak: 0, streakBonus: 0 },
    ]);
  });
});
