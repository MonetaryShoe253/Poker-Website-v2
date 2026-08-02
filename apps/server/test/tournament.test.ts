import { describe, expect, it } from "vitest";
import {
  applyFloor,
  applyStreakMiss,
  calculateTournamentPoints,
  streakBonusForWeeks,
} from "../src/services/tournament";

describe("tournament formula", () => {
  const formula = { A: 2.5, B: 0.22, ITM_PERCENT: 0.2, BOUNTY_VALUE: 5 };

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

describe("floor points", () => {
  it("tops up a below-floor finish to the guaranteed minimum", () => {
    expect(applyFloor(0)).toBe(2);
    expect(applyFloor(1)).toBe(2);
  });

  it("never lowers a finish that already clears the floor", () => {
    expect(applyFloor(60)).toBe(60);
  });
});

describe("streak bonus curve", () => {
  it("pays nothing for a lone clean week", () => {
    expect(streakBonusForWeeks(0)).toBe(0);
    expect(streakBonusForWeeks(1)).toBe(0);
  });

  it("pays the streak length itself from the second week on", () => {
    expect(streakBonusForWeeks(2)).toBe(2);
    expect(streakBonusForWeeks(5)).toBe(5);
  });
});

describe("streak miss penalty", () => {
  it("breaks a short streak (<3 weeks) outright", () => {
    expect(applyStreakMiss(0)).toBe(0);
    expect(applyStreakMiss(1)).toBe(0);
    expect(applyStreakMiss(2)).toBe(0);
  });

  it("costs an established streak (3+ weeks) 3 weeks of progress instead of wiping it", () => {
    expect(applyStreakMiss(3)).toBe(0);
    expect(applyStreakMiss(5)).toBe(2);
    expect(applyStreakMiss(10)).toBe(7);
  });
});
