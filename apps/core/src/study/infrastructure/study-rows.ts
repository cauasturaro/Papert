import type { Prisma } from '@prisma/client';
import {
  filesSchema,
  roadmapSchema,
  stepSchema,
} from '../application/contracts/study.contract.js';
import {
  analyzedAttemptCount,
  solutionProgress,
} from '../domain/solution-progress.js';
import { progressStepIndex } from '../domain/study.js';
import type { RoadmapDefinition } from '../domain/study.js';

// The full workspace keeps every attempt for existing clients; history lists page through
// `attempts()` without file contents.
export const workspaceInclude = {
  roadmap: true,
  session: true,
  attempts: { orderBy: { createdAt: 'desc' } },
} as const;

type StoredWorkspace = Prisma.WorkspaceGetPayload<{
  include: typeof workspaceInclude;
}>;
export type StoredRoadmap = NonNullable<StoredWorkspace['roadmap']>;
type StoredAttempt = StoredWorkspace['attempts'][number];

export function toRoadmap(row: StoredRoadmap) {
  return {
    id: row.id,
    authorName: row.authorName,
    authorUserId: row.authorUserId,
    definition: roadmapSchema.parse(row.definition),
  };
}

// Same order as the attempts query: newest first, ties broken by descending id.
export function newestFirst(a: StoredAttempt, b: StoredAttempt) {
  const byDate = b.createdAt.getTime() - a.createdAt.getTime();
  if (byDate !== 0) {
    return byDate;
  }

  if (a.id === b.id) {
    return 0;
  }

  // Code-point order, matching PostgreSQL's uuid ordering for lowercase hex.
  return a.id < b.id ? 1 : -1;
}

export function toAttempt(row: StoredAttempt) {
  return {
    ...row,
    files: filesSchema.parse(row.files),
    challenge: stepSchema.shape.challenge.parse(row.challenge),
  };
}

export const attemptSummarySelect = {
  id: true,
  stepId: true,
  revision: true,
  challenge: true,
  result: true,
  createdAt: true,
} as const;

type StoredAttemptSummary = Prisma.StudyAttemptGetPayload<{
  select: typeof attemptSummarySelect;
}>;

export function toAttemptSummary(
  row: StoredAttemptSummary,
  steps: RoadmapDefinition['steps'],
) {
  const stepIndex = steps.findIndex((step) => step.id === row.stepId);

  return {
    ...row,
    challenge: stepSchema.shape.challenge.parse(row.challenge),
    stepIndex,
    stepTitle: steps[stepIndex]?.title ?? null,
  };
}

function solutionOf(
  definition: RoadmapDefinition,
  currentStep: number,
  attempts: StoredAttempt[],
) {
  const index = progressStepIndex(currentStep, definition.steps.length);
  const stepId = definition.steps[index]?.id;
  const stepAttempts = attempts.filter((item) => item.stepId === stepId);

  return solutionProgress(analyzedAttemptCount(stepAttempts));
}

export function toWorkspace(row: StoredWorkspace) {
  if (!row.session || !row.roadmap) {
    throw new Error('Workspace study session or roadmap is missing.');
  }

  const bound = toRoadmap(row.roadmap);

  return {
    id: row.id,
    roadmap: bound,
    currentStep: row.currentStep,
    revision: row.revision,
    notes: row.notes,
    files: filesSchema.parse(row.files),
    session: row.session,
    attempts: row.attempts.map(toAttempt),
    solution: solutionOf(bound.definition, row.currentStep, row.attempts),
  };
}
