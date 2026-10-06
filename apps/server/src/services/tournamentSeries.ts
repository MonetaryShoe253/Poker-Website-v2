import type { Prisma, Series, Session } from "@prisma/client";
import { FIXED_TOURNAMENT_BLIND_SCHEDULE, SUBMISSION_WINDOW } from "@uos-poker/shared";
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
  lateRegWindowMinutes: number;
}

function parseDateOnly(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

interface TournamentSessionRow {
  seriesId: string;
  date: Date;
  type: "TOURNAMENT";
  status: "SCHEDULED";
  code: string;
  submissionsOpenAt: Date;
  submissionsCloseAt: Date;
  blindSchedule: Prisma.InputJsonValue;
}

/** One session row on the given London calendar day — the same shape every
 * tournament session gets, whether bulk-generated at series creation or
 * added one at a time afterward. Time-of-day/duration/late-reg window are
 * deliberately left unset here: until the session is opened, they're derived
 * live from the series' current template (see computeSessionTimes), so a
 * newly added session automatically follows whatever the series' norms are
 * right now rather than a snapshot frozen at insert time. */
function buildTournamentSessionRow(seriesId: string, day: Date): TournamentSessionRow {
  const parts = londonParts(day);
  return {
    seriesId,
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
    blindSchedule: FIXED_TOURNAMENT_BLIND_SCHEDULE as unknown as Prisma.InputJsonValue,
  };
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
      lateRegWindowMinutes: input.lateRegWindowMinutes,
    },
  });

  const rows: TournamentSessionRow[] = [];
  for (let day = startsAt; day <= endsAt; day = addLondonDays(day, 1)) {
    if (londonParts(day).weekday !== 2) continue; // Tuesday only
    rows.push(buildTournamentSessionRow(series.id, day));
  }
  if (rows.length > 0) {
    await prisma.session.createMany({ data: rows });
  }

  return { id: series.id, sessionCount: rows.length };
}

/** Adds a single extra tournament session to an existing series on an
 * arbitrary date — a one-off makeup session, not bound to the series' usual
 * weekday. It slots into temporal order for free: every session list sorts
 * by date fresh on each read, so nothing needs reordering or renumbering. */
export async function addSessionToSeries(seriesId: string, dateStr: string): Promise<{ id: string; date: Date }> {
  const { year, month, day } = parseDateOnly(dateStr);
  const date = londonToUtc(year, month, day);
  const row = buildTournamentSessionRow(seriesId, date);
  const session = await prisma.session.create({ data: row });
  return { id: session.id, date: session.date };
}

export interface SessionTimes {
  scheduledStartAt: Date | null;
  lateRegClosesAt: Date | null;
  estimatedEndAt: Date | null;
}

/**
 * Effective start/duration for a session: the session's own snapshot if
 * it's been opened, else derived live from the parent series' current
 * template — so editing a series' parameters instantly reflects on every
 * not-yet-opened session with no cascade/bulk-update needed.
 */
export function computeSessionTimes(
  session: Pick<Session, "date" | "scheduledStartTime" | "estimatedDuration" | "lateRegWindowMinutes">,
  series: Pick<Series, "sessionStartMinutesOfDay" | "sessionDurationMinutes" | "lateRegWindowMinutes">,
): SessionTimes {
  const snapshotted = session.scheduledStartTime !== null;
  const scheduledStartAt = snapshotted
    ? session.scheduledStartTime
    : series.sessionStartMinutesOfDay !== null
      ? londonDateAndMinutesToUtc(session.date, series.sessionStartMinutesOfDay)
      : null;
  const durationMinutes = snapshotted ? session.estimatedDuration : series.sessionDurationMinutes;
  const lateRegWindowMinutes = snapshotted ? session.lateRegWindowMinutes : series.lateRegWindowMinutes;

  const lateRegClosesAt =
    scheduledStartAt && lateRegWindowMinutes != null
      ? new Date(scheduledStartAt.getTime() + lateRegWindowMinutes * 60_000)
      : null;
  const estimatedEndAt =
    scheduledStartAt && durationMinutes != null
      ? new Date(scheduledStartAt.getTime() + durationMinutes * 60_000)
      : null;

  return { scheduledStartAt, lateRegClosesAt, estimatedEndAt };
}
