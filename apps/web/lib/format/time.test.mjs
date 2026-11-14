import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  formatLocalTime,
  formatRelativeTime,
  formatResetTime,
  formatWait,
} from "./time.ts";
import { formatCount } from "./number.ts";

// Local wall-clock dates so the assertions hold in any time zone.
const now = new Date(2026, 10, 6, 20, 30);

function at(day, hour, minute = 0) {
  return new Date(2026, 10, day, hour, minute);
}

test("relative time reads naturally for recent moments", () => {
  const recent = new Date(now.getTime() - 20_000);
  const minutesAgo = new Date(now.getTime() - 2 * 60_000);
  const hoursAgo = at(6, 17, 0);

  assert.equal(formatRelativeTime(recent, now), "just now");
  assert.equal(formatRelativeTime(minutesAgo, now), "2 min ago");
  assert.equal(formatRelativeTime(hoursAgo, now), "3 hours ago");
  assert.equal(formatRelativeTime(at(6, 19, 0), now), "1 hour ago");
});

test("relative time switches to calendar days, then to a date", () => {
  const lastNight = at(5, 23, 50);
  const threeDaysAgo = at(3, 10);
  const lastMonth = at(1, 10);
  lastMonth.setMonth(8);

  assert.equal(formatRelativeTime(lastNight, now), "yesterday");
  assert.equal(formatRelativeTime(threeDaysAgo, now), "3 days ago");
  assert.equal(formatRelativeTime(at(7, 9), now), "tomorrow");
  assert.equal(
    formatRelativeTime(new Date(now.getTime() + 5 * 60_000), now),
    "in 5 min",
  );

  const expectedDate = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(lastMonth);

  assert.equal(formatRelativeTime(lastMonth, now), expectedDate);
});

test("reset times use the local clock and say when it is tomorrow", () => {
  const tonight = at(6, 21);
  const tomorrowMorning = at(7, 9);
  const later = at(9, 9);

  assert.equal(
    formatResetTime(tonight, now),
    `resets at ${formatLocalTime(tonight)}`,
  );
  assert.equal(
    formatResetTime(tomorrowMorning, now),
    `resets tomorrow at ${formatLocalTime(tomorrowMorning)}`,
  );
  assert.match(formatResetTime(later, now), /^resets on .+ at .+$/);
});

test("local time follows Intl with the default locale", () => {
  const expected = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(at(6, 21));

  assert.equal(formatLocalTime(at(6, 21)), expected);
  assert.equal(formatLocalTime(at(6, 21).getTime()), expected);
});

test("waits and counts", () => {
  assert.equal(formatWait(1500), "a few seconds");
  assert.equal(formatWait(42_000), "42 seconds");
  assert.equal(formatWait(61_000), "2 minutes");
  assert.equal(formatWait(60 * 60_000), "1 hour");

  assert.equal(formatCount(1, "step"), "1 step");
  assert.equal(formatCount(3, "step"), "3 steps");
  assert.equal(formatCount(2, "query", "queries"), "2 queries");
});
