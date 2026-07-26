import type { Series, Session } from "@prisma/client";
import { SUBMISSION_WINDOW, TOURNAMENT_LATE_REG_WINDOW_MINUTES } from "@uos-poker/shared";
import { prisma } from "../db";
import { addLondonDays, londonDateAndMinutesToUtc, londonParts, londonToUtc } from "../time";
import { generateSessionCode } from "./seasons";

/**
 * The explicit tournament-series flow (§ tournament management). Fully
 * separate from services/seasons.ts's rolling auto-generation — creates its
 * own Series (never touching another series' isActive) and bulk-creates
 * every Tuesday session between the given dates immediately, rather than a
 * rolling 14-day horizon.
 */

export interface CreateTournamentSeriesInput {
  name: string;
  startDate: string; // "YYYY-MM-DD", London calendar date, inclusive
  endDate: string; // "YYYY-MM-DD", London calendar date, inclusive
  sessionStartMinutesOfDay: number;
  sessionDurationMinutes: number;
  expectedPlayerCount: number;
}

function parseDateOnly(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

export async function createTournamentSeries(
  input: CreateTournamentSeriesInput,
): Promise<{ id: string; sessionCount: number }> {
  const start = parseDateOnly(input.startDate);
  const end = parseDateOnly(input.endDate);
  const startsAt = londonToUtc(start.year, start.month, start.day);
  const endsAt = londonToUtc(end.year, end.month, end.day);

  const series = await prisma.series.create({
    data: {
      name: input.name,
      startsAt,
      endsAt,
      isActive: false,
      status: "ACTIVE",
      sessionStartMinutesOfDay: input.sessionStartMinutesOfDay,
      sessionDurationMinutes: input.sessionDurationMinutes,
      expectedPlayerCount: input.expectedPlayerCount,
    },
  });

  const rows: Array<{
    seriesId: string;
    date: Date;
    type: "TOURNAMENT";
    status: "SCHEDULED";
    code: string;
    submissionsOpenAt: Date;
    submissionsCloseAt: Date;
  }> = [];
  for (let day = startsAt; day <= endsAt; day = addLondonDays(day, 1)) {
    const parts = londonParts(day);
    if (parts.weekday !== 2) continue; // Tuesday only
    rows.push({
      seriesId: series.id,
      date: day,
      type: "TOURNAMENT",
      status: "SCHEDULED",
      code: generateSessionCode(),
      submissionsOpenAt: londonToUtc(parts.year, parts.month, parts.day, SUBMISSION_WINDOW.openHour),
      submissionsCloseAt: londonToUtc(
        parts.year,
        parts.month,
        parts.day,
        SUBMISSION_WINDOW.closeHour,
        SUBMISSION_WINDOW.closeMinute,
        59,
      ),
    });
  }
  if (rows.length > 0) {
    await prisma.session.createMany({ data: rows });
  }

  return { id: series.id, sessionCount: rows.length };
}

export interface SessionTimes {
  scheduledStartAt: Date | null;
  lateRegClosesAt: Date | null;
  estimatedEndAt: Date | null;
  expectedPlayerCount: number | null;
}

/**
 * Effective start/duration/expected-count for a session: the session's own
 * snapshot if it's been opened, else derived live from the parent series'
 * current template — so editing a series' parameters instantly reflects on
 * every not-yet-opened session with no cascade/bulk-update needed.
 */
export function computeSessionTimes(
  session: Pick<Session, "date" | "scheduledStartTime" | "estimatedDuration" | "expectedPlayerCount">,
  series: Pick<Series, "sessionStartMinutesOfDay" | "sessionDurationMinutes" | "expectedPlayerCount">,
): SessionTimes {
  const snapshotted = session.scheduledStartTime !== null;
  const scheduledStartAt = snapshotted
    ? session.scheduledStartTime
    : series.sessionStartMinutesOfDay !== null
      ? londonDateAndMinutesToUtc(session.date, series.sessionStartMinutesOfDay)
      : null;
  const durationMinutes = snapshotted ? session.estimatedDuration : series.sessionDurationMinutes;
  const expectedPlayerCount = snapshotted ? session.expectedPlayerCount : series.expectedPlayerCount;

  const lateRegClosesAt = scheduledStartAt
    ? new Date(scheduledStartAt.getTime() + TOURNAMENT_LATE_REG_WINDOW_MINUTES * 60_000)
    : null;
  const estimatedEndAt =
    scheduledStartAt && durationMinutes != null
      ? new Date(scheduledStartAt.getTime() + durationMinutes * 60_000)
      : null;

  return { scheduledStartAt, lateRegClosesAt, estimatedEndAt, expectedPlayerCount };
}
