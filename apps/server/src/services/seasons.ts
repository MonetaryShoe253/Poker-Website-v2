import type { Season } from "@prisma/client";
import {
  DEFAULT_POINTS_SCHEME,
  SESSION_CODE_ALPHABET,
  SESSION_CODE_LENGTH,
  SUBMISSION_WINDOW,
} from "@uos-poker/shared";
import { randomInt } from "node:crypto";
import { prisma } from "../db";
import { addLondonDays, londonMidnight, londonParts, londonToUtc } from "../time";

/**
 * Seasons + the weekly session scheduler.
 *
 * Sessions auto-create for the active season from a recurrence rule
 * (default: Tuesday TOURNAMENT, Thursday CASH — §22) with fresh 6-char
 * codes from the unambiguous alphabet. Codes are only ever exposed through
 * the admin panel.
 */

export interface RecurrenceRule {
  weekday: number; // 0 = Sunday … 6 = Saturday
  type: "TOURNAMENT" | "CASH";
}

export const DEFAULT_RECURRENCE: RecurrenceRule[] = [
  { weekday: 2, type: "TOURNAMENT" }, // Tuesdays
  { weekday: 4, type: "CASH" }, // Thursdays
];

export function generateSessionCode(): string {
  let code = "";
  for (let i = 0; i < SESSION_CODE_LENGTH; i++) {
    code += SESSION_CODE_ALPHABET[randomInt(SESSION_CODE_ALPHABET.length)];
  }
  return code;
}

/** The active season; auto-creates the academic year if none exists. */
export async function ensureActiveSeason(): Promise<Season> {
  const existing = await prisma.season.findFirst({ where: { isActive: true } });
  if (existing) return existing;
  const now = londonParts(new Date());
  const startYear = now.month >= 9 ? now.year : now.year - 1;
  const season = await prisma.season.create({
    data: {
      name: `Season ${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`,
      startsAt: londonToUtc(startYear, 9, 1),
      endsAt: londonToUtc(startYear + 1, 9, 1),
      isActive: true,
    },
  });
  await prisma.pointsScheme.create({
    data: { seasonId: season.id, scheme: DEFAULT_POINTS_SCHEME },
  });
  return season;
}

export async function getRecurrence(): Promise<RecurrenceRule[]> {
  const setting = await prisma.setting.findUnique({ where: { key: "sessionRecurrence" } });
  if (setting && Array.isArray(setting.value)) {
    return setting.value as unknown as RecurrenceRule[];
  }
  return DEFAULT_RECURRENCE;
}

/** Create any missing sessions for the next `horizonDays` days. */
export async function ensureUpcomingSessions(horizonDays = 14): Promise<void> {
  const season = await ensureActiveSeason();
  const recurrence = await getRecurrence();
  const today = londonMidnight(new Date());

  for (let offset = 0; offset < horizonDays; offset++) {
    const day = addLondonDays(today, offset);
    if (day < season.startsAt || day >= season.endsAt) continue;
    const parts = londonParts(day);
    for (const rule of recurrence) {
      if (parts.weekday !== rule.weekday) continue;
      await prisma.session.upsert({
        where: {
          seasonId_date_type: { seasonId: season.id, date: day, type: rule.type },
        },
        create: {
          seasonId: season.id,
          date: day,
          type: rule.type,
          code: generateSessionCode(),
          submissionsOpenAt: londonToUtc(
            parts.year,
            parts.month,
            parts.day,
            SUBMISSION_WINDOW.openHour,
          ),
          submissionsCloseAt: londonToUtc(
            parts.year,
            parts.month,
            parts.day,
            SUBMISSION_WINDOW.closeHour,
            SUBMISSION_WINDOW.closeMinute,
            59,
          ),
        },
        update: {},
      });
    }
  }
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export function startSessionScheduler(): void {
  void ensureUpcomingSessions().catch((err) =>
    console.error("session scheduler boot failed:", err),
  );
  schedulerTimer = setInterval(
    () =>
      void ensureUpcomingSessions().catch((err) => console.error("session scheduler:", err)),
    6 * 60 * 60 * 1000,
  );
}

export function stopSessionScheduler(): void {
  if (schedulerTimer) clearInterval(schedulerTimer);
}

/** Points for a finishing position under a season's scheme. */
export function pointsForPosition(
  scheme: { positions: Record<string, number>; participation: number },
  position: number,
): number {
  return scheme.positions[String(position)] ?? scheme.participation;
}
