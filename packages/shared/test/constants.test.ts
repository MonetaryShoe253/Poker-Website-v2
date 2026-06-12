import { describe, expect, it } from "vitest";
import {
  BLINDS,
  BANKROLL,
  DEFAULT_POINTS_SCHEME,
  ELO,
  NICKNAME,
  SESSION_CODE_ALPHABET,
  SESSION_CODE_LENGTH,
  TABLE,
} from "../src/index";

describe("game constants", () => {
  it("session code alphabet contains no ambiguous characters", () => {
    for (const ch of ["0", "O", "1", "I"]) {
      expect(SESSION_CODE_ALPHABET).not.toContain(ch);
    }
    expect(new Set(SESSION_CODE_ALPHABET).size).toBe(SESSION_CODE_ALPHABET.length);
    expect(SESSION_CODE_LENGTH).toBe(6);
  });

  it("blinds and buy-ins are coherent", () => {
    expect(BLINDS.big).toBe(2 * BLINDS.small);
    expect(BANKROLL.tableBuyInMin).toBeGreaterThanOrEqual(BLINDS.big * 10);
    expect(BANKROLL.tableBuyInMax).toBeLessThanOrEqual(BANKROLL.starting);
    expect(TABLE.maxSeats).toBe(6);
  });

  it("default points scheme matches the brief (10/7/5/3/2, participation 1)", () => {
    expect(DEFAULT_POINTS_SCHEME.positions[1]).toBe(10);
    expect(DEFAULT_POINTS_SCHEME.positions[2]).toBe(7);
    expect(DEFAULT_POINTS_SCHEME.positions[3]).toBe(5);
    expect(DEFAULT_POINTS_SCHEME.positions[4]).toBe(3);
    expect(DEFAULT_POINTS_SCHEME.positions[5]).toBe(2);
    expect(DEFAULT_POINTS_SCHEME.participation).toBe(1);
  });

  it("elo params match the brief", () => {
    expect(ELO.start).toBe(1000);
    expect(ELO.kProvisional).toBe(24);
    expect(ELO.kStandard).toBe(8);
    expect(ELO.provisionalHands).toBe(30);
    expect(ELO.floor).toBe(100);
  });

  it("nickname rules match the brief", () => {
    expect(NICKNAME.min).toBe(3);
    expect(NICKNAME.max).toBe(16);
    expect(NICKNAME.pattern.test("Kiran_22")).toBe(true);
    expect(NICKNAME.pattern.test("bad name!")).toBe(false);
  });
});
