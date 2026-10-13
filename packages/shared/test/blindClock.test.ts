import { describe, expect, it } from "vitest";
import { resolveBlindClock } from "../src/blindClock";

const MIN = 60_000;
const schedule = [{ durationMinutes: 15 }, { durationMinutes: 15 }, { durationMinutes: 10 }, { durationMinutes: 20 }];
const T0 = 1_700_000_000_000;

const running = (currentBlindLevel = 0, timerStartedAt = T0) => ({
  currentBlindLevel,
  timerStartedAt,
  timerPausedAt: null,
  isPaused: false,
});

describe("resolveBlindClock", () => {
  it("stays on the current level while time remains", () => {
    const r = resolveBlindClock(schedule, running(), T0 + 15 * MIN - 1);
    expect(r).toMatchObject({ currentBlindLevel: 0, timerStartedAt: T0, advanced: false });
  });

  it("advances to the next level the instant the timer hits 0:00", () => {
    const r = resolveBlindClock(schedule, running(), T0 + 15 * MIN);
    expect(r).toMatchObject({ currentBlindLevel: 1, timerStartedAt: T0 + 15 * MIN, advanced: true });
  });

  it("starts the next level where the last ended, not at read time (no drift)", () => {
    const r = resolveBlindClock(schedule, running(), T0 + 17 * MIN);
    expect(r.currentBlindLevel).toBe(1);
    expect(r.timerStartedAt).toBe(T0 + 15 * MIN); // 2 min already gone in level 2
  });

  it("catches up across several levels with differing durations", () => {
    // 15 + 15 + 10 = 40 min → level index 3, started at T0+40, 2 min in.
    const r = resolveBlindClock(schedule, running(), T0 + 42 * MIN);
    expect(r).toMatchObject({ currentBlindLevel: 3, timerStartedAt: T0 + 40 * MIN });
  });

  it("never rolls past the final level", () => {
    const r = resolveBlindClock(schedule, running(3, T0), T0 + 500 * MIN);
    expect(r).toMatchObject({ currentBlindLevel: 3, timerStartedAt: T0, advanced: false });
  });

  it("does not advance while paused, even long after the deadline", () => {
    const paused = { currentBlindLevel: 0, timerStartedAt: T0, timerPausedAt: T0 + 10 * MIN, isPaused: true };
    const r = resolveBlindClock(schedule, paused, T0 + 60 * MIN);
    expect(r).toMatchObject({ currentBlindLevel: 0, timerStartedAt: T0, timerPausedAt: T0 + 10 * MIN });
  });

  it("does nothing before the timer starts or without a schedule", () => {
    const idle = { currentBlindLevel: 0, timerStartedAt: null, timerPausedAt: null, isPaused: false };
    expect(resolveBlindClock(schedule, idle, T0).advanced).toBe(false);
    expect(resolveBlindClock(null, running(), T0 + 99 * MIN).advanced).toBe(false);
    expect(resolveBlindClock([], running(), T0 + 99 * MIN).advanced).toBe(false);
  });
});
