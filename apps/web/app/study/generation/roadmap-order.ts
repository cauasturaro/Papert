import type { StudyableRoadmap } from "./drafts-api.ts";

function activityTime(item: StudyableRoadmap) {
  const value = item.workspace?.lastActivityAt;
  const time = value ? Date.parse(value) : Number.NaN;

  return Number.isNaN(time) ? null : time;
}

/**
 * Started roadmaps first, most recent activity first; then roadmaps not started yet.
 * Without activity times the server's order is kept.
 */
export function orderByLastActivity(items: StudyableRoadmap[]) {
  const started = items.filter((item) => item.workspace !== null);
  const notStarted = items.filter((item) => item.workspace === null);

  const ordered = started
    .map((item, index) => ({ item, index, time: activityTime(item) }))
    .sort((a, b) => {
      if (a.time !== null && b.time !== null && a.time !== b.time) {
        return b.time - a.time;
      }

      if (a.time !== null && b.time === null) {
        return -1;
      }

      if (a.time === null && b.time !== null) {
        return 1;
      }

      return a.index - b.index;
    })
    .map((entry) => entry.item);

  return [...ordered, ...notStarted];
}
