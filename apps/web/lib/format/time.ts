// Copy stays in English like the rest of the interface; clock times and dates follow the
// learner's locale (`undefined` lets Intl pick it).

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export type DateInput = Date | number | string;

function toDate(value: DateInput) {
  return value instanceof Date ? value : new Date(value);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Calendar days between two dates in local time; positive when `date` is later.
function calendarDayOffset(date: Date, now: Date) {
  const difference = startOfDay(date).getTime() - startOfDay(now).getTime();

  return Math.round(difference / DAY_MS);
}

function plural(count: number, unit: string) {
  return count === 1 ? `${count} ${unit}` : `${count} ${unit}s`;
}

/** Clock time in the learner's locale, such as "21:00" or "9:00 PM". */
export function formatLocalTime(value: DateInput) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return formatter.format(toDate(value));
}

/** Short calendar date in the learner's locale; the year appears only when it differs. */
export function formatLocalDate(value: DateInput, now: DateInput = new Date()) {
  const date = toDate(value);
  const sameYear = date.getFullYear() === toDate(now).getFullYear();

  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });

  return formatter.format(date);
}

/**
 * Past moments as "just now", "5 min ago", "3 hours ago", "yesterday", "4 days ago",
 * then a short date. Future moments read "in 5 min", "tomorrow" and so on.
 */
export function formatRelativeTime(
  value: DateInput,
  now: DateInput = new Date(),
) {
  const date = toDate(value);
  const reference = toDate(now);
  const elapsed = reference.getTime() - date.getTime();
  const future = elapsed < 0;
  const distance = Math.abs(elapsed);

  if (distance < MINUTE_MS) {
    return future ? "in a moment" : "just now";
  }

  if (distance < HOUR_MS) {
    const minutes = Math.floor(distance / MINUTE_MS);

    return future ? `in ${minutes} min` : `${minutes} min ago`;
  }

  const days = calendarDayOffset(date, reference);

  if (days === 0) {
    const hours = plural(Math.floor(distance / HOUR_MS), "hour");

    return future ? `in ${hours}` : `${hours} ago`;
  }

  if (days === -1) {
    return "yesterday";
  }

  if (days === 1) {
    return "tomorrow";
  }

  if (Math.abs(days) < 7) {
    const count = plural(Math.abs(days), "day");

    return future ? `in ${count}` : `${count} ago`;
  }

  return formatLocalDate(date, reference);
}

/** "resets at 21:00", "resets tomorrow at 09:00" or "resets on Nov 9 at 09:00". */
export function formatResetTime(value: DateInput, now: DateInput = new Date()) {
  const date = toDate(value);
  const time = formatLocalTime(date);
  const days = calendarDayOffset(date, toDate(now));

  if (days <= 0) {
    return `resets at ${time}`;
  }

  if (days === 1) {
    return `resets tomorrow at ${time}`;
  }

  return `resets on ${formatLocalDate(date, now)} at ${time}`;
}

/** A wait such as a Retry-After delay: "a few seconds", "42 seconds", "2 minutes", "1 hour". */
export function formatWait(milliseconds: number) {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);

  if (seconds < 5) {
    return "a few seconds";
  }

  if (seconds < 60) {
    return plural(seconds, "second");
  }

  const minutes = Math.ceil(seconds / 60);

  if (minutes < 60) {
    return plural(minutes, "minute");
  }

  return plural(Math.ceil(minutes / 60), "hour");
}
