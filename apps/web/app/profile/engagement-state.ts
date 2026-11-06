import type { Achievement, Engagement, Streak } from "./engagement-api.ts";

export const ACHIEVEMENT_MEANING =
  "Papert awards this badge once, when every step's challenge of a roadmap has been approved. It records your work in Papert; it is not an external certification.";

export const STREAK_RULE =
  "A day counts when Seymour finishes analyzing one of your attempts, approved or not. Several analyses on one day count once. Chatting and saving files do not count.";

function days(count: number) {
  return count === 1 ? "1 day" : `${count} days`;
}

/** What the learner should know about their streak today. */
export function streakMessage(streak: Streak) {
  if (streak.status === "studied") {
    return `You studied today. Analyze an attempt tomorrow to reach ${days(streak.current + 1)}.`;
  }

  if (streak.status === "pending") {
    return `Analyze an attempt today to keep your ${days(streak.current)} streak.`;
  }

  if (streak.status === "broken") {
    return "Your last streak ended. Analyze an attempt to start a new one.";
  }

  return "Analyze an attempt to start your first streak.";
}

// Study days are calendar dates, so they are formatted without shifting zones.
const dayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

export function dayLabel(day: string) {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

export function awardedLabel(achievement: Achievement) {
  return dateFormat.format(new Date(achievement.awardedAt));
}

export function progressLabel(completedSteps: number, totalSteps: number) {
  const done = Math.min(completedSteps, totalSteps);

  return `${done} of ${totalSteps} steps approved`;
}

export function achievementFor(
  engagement: Engagement | undefined,
  roadmapId: string,
) {
  return engagement?.achievements.find((item) => item.roadmapId === roadmapId);
}

/** The browser's zone is sent once, only while the profile has none. */
export function zoneToDetect(
  engagement: Engagement | undefined,
  browserZone: string | undefined,
) {
  if (!engagement || engagement.timeZoneSet || !browserZone) {
    return null;
  }

  return browserZone;
}

/** Zones the runtime knows, with the current one first when it is missing from the list. */
export function timeZoneChoices(known: string[], current: string) {
  const zones = known.includes(current) ? known : [current, ...known];

  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}
