import { createJsonRequest } from "@/lib/api/request";

export type StreakStatus = "studied" | "pending" | "broken" | "none";

export type Streak = {
  current: number;
  longest: number;
  lastStudyDay: string | null;
  status: StreakStatus;
  // The last 14 days ending today, oldest first.
  recent: { day: string; studied: boolean }[];
};

/** A badge Core awarded when every step of a roadmap was approved. */
export type Achievement = {
  kind: "roadmap_completed";
  roadmapId: string;
  workspaceId: string;
  title: string;
  concepts: string[];
  stepCount: number;
  awardedAt: string;
};

export type RoadmapProgress = {
  roadmapId: string;
  workspaceId: string;
  title: string;
  completedSteps: number;
  totalSteps: number;
  completed: boolean;
  achieved: boolean;
};

export type Engagement = {
  timeZone: string;
  // False while study days are still dated in UTC because no zone was saved.
  timeZoneSet: boolean;
  today: string;
  streak: Streak;
  achievements: Achievement[];
  roadmaps: RoadmapProgress[];
};

const request = createJsonRequest({
  base: "/api",
  unauthorized: "Sign in to see your progress.",
  unavailable: "Your progress is unavailable. Try again.",
});

export function getEngagement() {
  return request<Engagement>("engagement");
}

export function saveTimeZone(timeZone: string, detected: boolean) {
  return request<Engagement>("engagement/time-zone", "PUT", {
    timeZone,
    detected,
  });
}
