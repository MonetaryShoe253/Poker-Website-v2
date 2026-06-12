import { TIMEZONE } from "@uos-poker/shared";

/**
 * Europe/London calendar helpers. All "day", session, and bonus logic uses
 * London local time regardless of server timezone.
 */

const partsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hour12: false,
});

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface LondonParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

export function londonParts(date: Date): LondonParts {
  const parts: Record<string, string> = {};
  for (const part of partsFormat.formatToParts(date)) {
    parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday ?? "Sun"] ?? 0,
  };
}

/** UTC instant for the given London wall-clock time. */
export function londonToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  // Two-pass offset correction (sufficient for GMT/BST).
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 2; i++) {
    const shown = londonParts(new Date(guess));
    const shownUtc = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second,
    );
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    guess += desired - shownUtc;
  }
  return new Date(guess);
}

/** Midnight (00:00 London) of the calendar day containing `date`. */
export function londonMidnight(date: Date): Date {
  const p = londonParts(date);
  return londonToUtc(p.year, p.month, p.day);
}

/** Add days to a London calendar date (returns London midnight). */
export function addLondonDays(date: Date, days: number): Date {
  // DST-safe: add in UTC then re-anchor to London midnight.
  const midnight = londonMidnight(date);
  return londonMidnight(new Date(midnight.getTime() + days * 86_400_000 + 12 * 3_600_000));
}
