/** A calendar date in a learner's time zone, such as `2026-11-06`. */
export type CalendarDay = string;

// Learners whose browser never reported a zone are dated in UTC, like the daily quota.
export const DEFAULT_TIME_ZONE = 'UTC';

const DAY_MS = 24 * 60 * 60 * 1000;
const IANA_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

/** True for IANA zone names the runtime knows; offsets such as `+03:00` are rejected. */
export function isTimeZone(value: string) {
  if (value.length > 64 || !IANA_NAME.test(value)) {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });

    return true;
  } catch {
    return false;
  }
}

export function localDay(instant: Date, timeZone: string): CalendarDay {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function addDays(day: CalendarDay, days: number): CalendarDay {
  const start = Date.parse(`${day}T00:00:00Z`);

  return new Date(start + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: CalendarDay, to: CalendarDay) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);

  return Math.round((end - start) / DAY_MS);
}
