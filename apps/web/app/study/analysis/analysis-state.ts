// Pure rules behind the Analysis panel and the step overview; no React, testable with node:test.

export type AttemptStatus =
  | "not_evaluated"
  | "syntax_error"
  | "evaluating"
  | "needs_work"
  | "approved"
  | "analysis_failed";

export type FindingLike = {
  category: string;
  severity: "info" | "warning" | "error";
  path: string | null;
  line?: number | null;
  message: string;
};

type AttemptLike = {
  id: string;
  stepId: string;
  files?: Record<string, string>;
  result: {
    status: AttemptStatus;
    reason?: string;
    evaluation?: { criteria: { id: string; status: "met" | "not_met" }[] };
  };
  createdAt: string;
};

const SETTLED: AttemptStatus[] = [
  "approved",
  "needs_work",
  "analysis_failed",
  "syntax_error",
];

export function isSettled(status: AttemptStatus) {
  return SETTLED.includes(status);
}

/** The newest attempt with an official outcome, optionally on one step. */
export function latestSettledAttempt<T extends AttemptLike>(
  attempts: T[],
  stepId?: string,
) {
  const settled = attempts.filter((attempt) => {
    if (stepId !== undefined && attempt.stepId !== stepId) {
      return false;
    }

    return isSettled(attempt.result.status);
  });

  settled.sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );

  return settled[0] ?? null;
}

export type CriterionState = "met" | "not_met" | "unchecked";

/** Met / not met from the latest analyzed attempt on the step; unchecked otherwise. */
export function criteriaStates(
  criteria: { id: string }[],
  attempts: AttemptLike[],
  stepId: string,
) {
  const analyzed = attempts.filter((attempt) => {
    if (attempt.stepId !== stepId) {
      return false;
    }

    return !!attempt.result.evaluation;
  });

  const latest = latestSettledAttempt(analyzed);
  const reported = new Map(
    (latest?.result.evaluation?.criteria ?? []).map((criterion) => [
      criterion.id,
      criterion.status,
    ]),
  );

  const states = new Map<string, CriterionState>();

  for (const criterion of criteria) {
    states.set(criterion.id, reported.get(criterion.id) ?? "unchecked");
  }

  return states;
}

const SEVERITY_ORDER: Record<FindingLike["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/** Errors first, then warnings, then notes; the original order breaks ties. */
export function orderFindings<T extends FindingLike>(findings: T[]) {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort((left, right) => {
      const bySeverity =
        SEVERITY_ORDER[left.finding.severity] -
        SEVERITY_ORDER[right.finding.severity];

      return bySeverity !== 0 ? bySeverity : left.index - right.index;
    })
    .map(({ finding }) => finding);
}

/** Needs-work analyses on the step; two or more suggest offering more help. */
export function needsWorkCount(attempts: AttemptLike[], stepId: string) {
  return attempts.filter((attempt) => {
    return attempt.stepId === stepId && attempt.result.status === "needs_work";
  }).length;
}

export type AnalysisPhase = "queued" | "checking" | "writing";

/**
 * Seymour reports "mapping files" first and "checking each criterion" before its model
 * call, so the second progress event means feedback is being written.
 */
export function analysisPhase(execution: {
  status: string;
  sequence: number;
}): AnalysisPhase {
  if (execution.status === "queued") {
    return "queued";
  }

  return execution.sequence >= 2 ? "writing" : "checking";
}

export const FIRST_POLL_MS = 1500;
export const MAX_POLL_MS = 5000;
// Seymour stops analyzing after 45 s; past this the panel asks the learner to check again.
export const POLL_GIVE_UP_MS = 3 * 60_000;

/** Plain explanation of why an analysis did not produce a verdict. */
export function failureExplanation(reason: string | undefined) {
  switch (reason) {
    case "cancelled":
      return "You cancelled this analysis.";

    case "timed_out":
    case "deadline":
      return "The analysis took too long and was stopped.";

    case "failed":
      return "Seymour could not be reached to analyze your code.";

    case "invalid_output":
    case "criteria_mismatch":
    case "other_attempt":
    case "no_evaluation":
      return "Seymour's review was incomplete, so Papert could not use it.";

    default:
      return "The analysis did not finish.";
  }
}

/** Approximate analyses that still fit today's quota. */
export function analysesLeft(quota: {
  limit: number;
  used: number;
  reserved: number;
  reservation: number;
}) {
  const free = Math.max(0, quota.limit - quota.used - quota.reserved);

  if (quota.reservation <= 0) {
    return 0;
  }

  return Math.floor(free / quota.reservation);
}

export function askAboutCriterion(description: string) {
  return `Why does my solution not meet this criterion: "${description}"? Give me a hint, not the answer.`;
}

export function askAboutFinding(finding: FindingLike) {
  const where = finding.path
    ? ` in ${finding.path}${finding.line ? ` (line ${finding.line})` : ""}`
    : "";

  return `The analysis reported${where}: "${finding.message}" What does this mean and how should I approach fixing it? Give me a hint, not the answer.`;
}

export const STUCK_PROMPT =
  "I have tried this step several times and the analysis still says it needs work. Teach me the idea behind it step by step, without giving me the solution.";

const PATH_TOKEN =
  /`([^`\s]+)`|(?:^|[\s(])((?:[\w@.-]+\/)*[\w@-]+\.[a-z0-9]{1,6})(?=$|[\s),.:;])/gi;

/**
 * Workspace files the instructions mention, in order of first mention. Paths in backticks
 * or with a file extension count when they exist in `files` or look like a file to create.
 */
export function mentionedFiles(
  instructions: string,
  files: Record<string, string>,
) {
  const found: string[] = [];

  for (const match of instructions.matchAll(PATH_TOKEN)) {
    const raw = (match[1] ?? match[2] ?? "").replace(/^\.\//, "");
    const looksLikeFile = /\.[a-z0-9]{1,6}$/i.test(raw) && !/^\d/.test(raw);
    const known = Object.hasOwn(files, raw);

    if (!raw || raw.includes("//") || /^[a-z]+:/i.test(raw)) {
      continue;
    }

    if ((known || looksLikeFile) && !found.includes(raw)) {
      found.push(raw);
    }
  }

  return found;
}
