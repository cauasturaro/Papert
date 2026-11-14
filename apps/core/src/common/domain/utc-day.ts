const DAY_MS = 24 * 60 * 60 * 1000;

// Daily limits reset at midnight UTC for every user, regardless of their time zone.
export function utcDayStart(now: Date) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function nextUtcDayStart(now: Date) {
  return new Date(utcDayStart(now).getTime() + DAY_MS);
}

/** Calendar key such as `2026-11-03`. */
export function utcDayKey(now: Date) {
  return utcDayStart(now).toISOString().slice(0, 10);
}
