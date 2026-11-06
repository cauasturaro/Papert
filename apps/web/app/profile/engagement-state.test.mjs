import assert from "node:assert/strict";
import test from "node:test";
import {
  achievementFor,
  dayLabel,
  progressLabel,
  streakMessage,
  timeZoneChoices,
  zoneToDetect,
} from "./engagement-state.ts";

const streak = (status, current) => ({
  status,
  current,
  longest: 5,
  lastStudyDay: "2026-11-06",
  recent: [],
});

const engagement = {
  timeZone: "UTC",
  timeZoneSet: false,
  today: "2026-11-06",
  streak: streak("none", 0),
  achievements: [
    {
      kind: "roadmap_completed",
      roadmapId: "roadmap",
      workspaceId: "workspace",
      title: "Roadmap",
      concepts: [],
      stepCount: 2,
      awardedAt: "2026-11-06T12:00:00Z",
    },
  ],
  roadmaps: [],
};

test("streak messages follow the status Core computed", () => {
  assert.match(streakMessage(streak("studied", 1)), /reach 2 days/);
  assert.match(streakMessage(streak("pending", 1)), /keep your 1 day streak/);
  assert.match(streakMessage(streak("broken", 0)), /start a new one/);
  assert.match(streakMessage(streak("none", 0)), /first streak/);
});

test("calendar days are labelled without a zone shift", () => {
  assert.equal(dayLabel("2026-11-06"), "Fri, Nov 6");
  assert.equal(dayLabel("2027-01-01"), "Fri, Jan 1");
});

test("progress never reads past the last step", () => {
  assert.equal(progressLabel(1, 3), "1 of 3 steps approved");
  assert.equal(progressLabel(4, 3), "3 of 3 steps approved");
});

test("the completed roadmap note finds its badge by roadmap", () => {
  assert.equal(achievementFor(engagement, "roadmap")?.workspaceId, "workspace");
  assert.equal(achievementFor(engagement, "other"), undefined);
  assert.equal(achievementFor(undefined, "roadmap"), undefined);
});

test("the browser zone is detected only for a profile without one", () => {
  assert.equal(
    zoneToDetect(engagement, "America/Sao_Paulo"),
    "America/Sao_Paulo",
  );
  assert.equal(
    zoneToDetect({ ...engagement, timeZoneSet: true }, "America/Sao_Paulo"),
    null,
  );
  assert.equal(zoneToDetect(undefined, "America/Sao_Paulo"), null);
  assert.equal(zoneToDetect(engagement, undefined), null);
});

test("zone choices always include UTC and the stored zone", () => {
  assert.deepEqual(timeZoneChoices(["Europe/Lisbon"], "Asia/Tokyo"), [
    "UTC",
    "Asia/Tokyo",
    "Europe/Lisbon",
  ]);
  assert.deepEqual(timeZoneChoices(["UTC", "Asia/Tokyo"], "Asia/Tokyo"), [
    "UTC",
    "Asia/Tokyo",
  ]);
});
