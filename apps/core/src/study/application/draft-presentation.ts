import type { RoadmapDraft } from '../domain/roadmap-draft.js';

const FAILURE_MESSAGES: Record<string, string> = {
  cancelled:
    'Generation was cancelled. Your goal and sources are kept; generate again when ready.',
  invalid_output:
    'Seymour could not produce a valid roadmap. Nothing was saved; try again.',
  timed_out:
    'Generation took too long and stopped. Nothing was saved; try again.',
  failed: 'Generation failed. Nothing was saved; try again.',
};

function failureMessage(reason: string) {
  return FAILURE_MESSAGES[reason] ?? FAILURE_MESSAGES.failed;
}

/** Response shape of a roadmap draft; evidence and consulted sources stay private to it. */
export function draftView(draft: RoadmapDraft) {
  const outcome = draft.outcome;
  let failure: { reason: string; message: string } | null = null;
  let evidence: unknown[] = [];
  let consulted: unknown[] = [];

  if (outcome && 'reason' in outcome) {
    failure = {
      reason: outcome.reason,
      message: failureMessage(outcome.reason),
    };
  }

  if (outcome && 'roadmapId' in outcome) {
    evidence = outcome.evidence;
    consulted = outcome.consulted;
  }

  return {
    workspaceId: draft.workspaceId,
    goal: draft.goal,
    level: draft.level,
    status: draft.status,
    executionId: draft.executionId,
    failure,
    evidence,
    consulted,
    roadmap: draft.roadmap,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}
