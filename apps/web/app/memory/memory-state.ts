import type { MemoryItem, MemoryKind } from "./memory-api.ts";

export const MEMORY_MIN = 3;
export const MEMORY_MAX = 200;
export const MAX_ACTIVE = 30;

export const KIND_LABELS: Record<MemoryKind, string> = {
  preference: "Preference",
  difficulty: "Difficulty",
};

/** Proposals to review, then active items by kind; each list keeps the server's order. */
export function groupMemory(items: MemoryItem[]) {
  const active = items.filter((item) => item.status === "active");

  return {
    proposals: items.filter((item) => item.status === "proposed"),
    preferences: active.filter((item) => item.kind === "preference"),
    difficulties: active.filter((item) => item.kind === "difficulty"),
    activeCount: active.length,
  };
}

/** The proposal Seymour made with one answer, if the learner has not reviewed it yet. */
export function proposalFor(
  items: MemoryItem[] | undefined,
  executionId: string,
) {
  return items?.find(
    (item) => item.status === "proposed" && item.executionId === executionId,
  );
}

/** Why a memory text cannot be saved yet, or null; counts characters like Core does. */
export function memoryTextProblem(text: string) {
  const length = [...text.trim().replace(/\s+/g, " ")].length;

  if (length < MEMORY_MIN) {
    return `Write at least ${MEMORY_MIN} characters.`;
  }

  if (length > MEMORY_MAX) {
    return `Keep it under ${MEMORY_MAX} characters.`;
  }

  return null;
}
