import type { Grounding } from "../viewer/citations";

export type Execution = {
  id: string;
  workspaceId: string;
  kind: "chat" | "analysis" | "generation";
  prompt: string | null;
  // The tutor conversation of a chat; null for analysis and older jobs.
  conversationId?: string | null;
  // Durable memories Core sent with this request.
  memoryUsed?: number;
  // Tutor mode and reasoning effort of a chat; absent or null on older jobs.
  mode?: string | null;
  effort?: string | null;
  status: string;
  text: string;
  // Present on tutor answers in workspaces with sources (older answers lack it).
  grounding?: Grounding | null;
  sequence: number;
  charged: number;
  reserved: number;
  createdAt?: string;
  finishedAt?: string | null;
};

type QuotaLike = {
  limit: number;
  used: number;
  reserved: number;
  reservation: number;
};

export type TurnState = "working" | "answered" | "failed" | "stopped";

export function newerSnapshot(
  current: Execution | null,
  incoming: Execution,
): Execution | null {
  if (
    current &&
    (current.id !== incoming.id || incoming.sequence <= current.sequence)
  ) {
    return current;
  }

  return incoming;
}

export function isRunning(execution: Execution | null) {
  return !!execution && ["queued", "running"].includes(execution.status);
}

export function turnState(execution: Execution): TurnState {
  if (isRunning(execution)) {
    return "working";
  }

  if (execution.status === "completed") {
    return "answered";
  }

  if (execution.status === "cancelled") {
    return "stopped";
  }

  return "failed";
}

// Seymour reports progress as plain sentences; map the known ones to short learner labels.
const PROGRESS_LABELS: [RegExp, string][] = [
  [/searching your sources/i, "Looking at your sources…"],
  [/saved context|your code/i, "Looking at your code…"],
  [/earlier conversation/i, "Reading the earlier conversation…"],
];

/** What Seymour is doing while a request runs; never the raw status. */
export function progressLabel(execution: Execution) {
  if (execution.status !== "running") {
    return "Thinking…";
  }

  const known = PROGRESS_LABELS.find(([pattern]) =>
    pattern.test(execution.text),
  );

  return known ? known[1] : "Thinking…";
}

const FAILURE_FALLBACK = "Seymour couldn't answer this time. Try again.";

/** Learner copy for a request that ended without an answer. */
export function failureMessage(execution: Execution) {
  if (execution.status === "cancelled") {
    return "You stopped this answer.";
  }

  if (execution.status === "timed_out") {
    return "Seymour took too long to answer. Try again, or ask about a smaller part.";
  }

  const text = execution.text.trim();

  // Seymour's own failure copy is plain language; anything technical falls back.
  if (!text || text.length > 240 || /token|exception|error:/i.test(text)) {
    return FAILURE_FALLBACK;
  }

  return text;
}

/** A conservative estimate: each question may use up to one full reservation. */
export function questionsLeft(quota: QuotaLike) {
  const free = Math.max(0, quota.limit - quota.used - quota.reserved);

  if (quota.reservation <= 0) {
    return 0;
  }

  return Math.floor(free / quota.reservation);
}

/** Whether another request would exceed today's allowance. */
export function quotaBlocked(quota: QuotaLike) {
  return quota.used + quota.reserved + quota.reservation > quota.limit;
}
