import type { CitationLocation } from '../../common/domain/citation-location.js';
import type { DraftRecommendation } from './draft-recommendation.js';
import { StudyError } from './study.js';
import type { Level, Roadmap, RoadmapDefinition } from './study.js';

// The roadmap_draft table checks enforce the same goal length and values.
export const GOAL_MIN = 10;
export const GOAL_MAX = 500;
export const ACTIVE_DRAFT_LIMIT = 3;
export const GENERATED_MIN_STEPS = 3;
export const GENERATED_MAX_STEPS = 8;
export const GENERATED_AUTHOR_NAME = 'Papert learner';

export type GenerationStatus =
  'completed' | 'failed' | 'cancelled' | 'timed_out';

export type DraftStatus =
  'open' | 'generating' | 'generated' | 'failed' | 'discarded';

/** Step-level link between a generated roadmap and the learner's own source. */
export type SourceEvidence = {
  stepId: string;
  sourceId: string;
  cite: string;
  location: CitationLocation;
};

export type DraftOutcome =
  | { reason: string; executionId: string }
  | {
      roadmapId: string;
      executionId: string;
      evidence: SourceEvidence[];
      // Sources Core admitted for the generation, as they were named then.
      consulted: { id: string; filename: string }[];
    };

export type RoadmapDraft = {
  workspaceId: string;
  goal: string;
  level: Level;
  status: DraftStatus;
  executionId: string | null;
  outcome: DraftOutcome | null;
  // Community check that must settle before a generation; null until one runs.
  recommendation: DraftRecommendation | null;
  // Set once the roadmap is generated.
  roadmap: Roadmap | null;
  createdAt: Date;
  updatedAt: Date;
};

/** A candidate Seymour produced, already parsed from its wire format. */
export type GeneratedRoadmap = {
  definition: RoadmapDefinition;
  evidence: SourceEvidence[];
};

// Drafts still holding a workspace, sources or budget count against the limit.
export function activeDraft(status: DraftStatus) {
  return status === 'open' || status === 'failed' || status === 'generating';
}

export function assertDraftCapacity(active: number) {
  if (active >= ACTIVE_DRAFT_LIMIT) {
    throw new StudyError(
      'conflict',
      `You can prepare up to ${ACTIVE_DRAFT_LIMIT} roadmaps at a time. Generate or discard one first.`,
    );
  }
}

/** Only an open or failed draft may start a new generation. */
export function assertGenerationAllowed(status: DraftStatus | null) {
  if (status === null || status === 'discarded') {
    throw new StudyError('not_found', 'Roadmap draft not found.');
  }

  if (status === 'generating') {
    throw new StudyError(
      'conflict',
      'A roadmap is already being generated for this draft.',
    );
  }

  if (status === 'generated') {
    throw new StudyError(
      'conflict',
      'This draft already produced a roadmap. Open it to study.',
    );
  }
}

/** A generated or generating draft is no longer the learner's to throw away. */
export function assertDiscardAllowed(status: DraftStatus | null) {
  if (status === null || status === 'discarded') {
    throw new StudyError('not_found', 'Roadmap draft not found.');
  }

  if (status === 'generating') {
    throw new StudyError(
      'conflict',
      'Cancel the running generation before discarding this draft.',
    );
  }

  if (status === 'generated') {
    throw new StudyError(
      'conflict',
      'A generated roadmap cannot be discarded.',
    );
  }
}

/** Rules every generated roadmap must meet on top of the general roadmap schema. */
export function generatedRoadmapProblem(definition: RoadmapDefinition) {
  const count = definition.steps.length;

  if (count < GENERATED_MIN_STEPS || count > GENERATED_MAX_STEPS) {
    return 'step_count';
  }

  for (const step of definition.steps) {
    const criteria = step.challenge.criteria.length;

    if (criteria < 2 || criteria > 5) {
      return 'criteria_count';
    }

    if (!step.concepts || !step.requires) {
      return 'missing_concepts';
    }
  }

  if (Object.keys(definition.starterFiles).length === 0) {
    return 'no_starter_files';
  }

  return null;
}

/**
 * Evidence survives only for sources still ready now and steps of this roadmap.
 * A source deleted during generation therefore never appears as used.
 */
export function authorizedEvidence(
  evidence: SourceEvidence[],
  liveSourceIds: string[],
  stepIds: string[],
) {
  const live = new Set(liveSourceIds);
  const steps = new Set(stepIds);

  return evidence.filter(
    (item) => live.has(item.sourceId) && steps.has(item.stepId),
  );
}

export type GenerationDecision =
  | { action: 'ignore' }
  | { action: 'release'; status: 'open' | 'failed'; reason: string }
  | { action: 'consolidate'; roadmap: GeneratedRoadmap };

/**
 * Applies a finished generation to its locked draft exactly once. Only the execution
 * the draft is waiting for counts; redelivered or late results are ignored.
 */
export function generationDecision(
  draft: { status: DraftStatus; executionId: string | null } | null,
  executionId: string,
  status: GenerationStatus,
  candidate: GeneratedRoadmap | null,
): GenerationDecision {
  if (
    !draft ||
    draft.status !== 'generating' ||
    draft.executionId !== executionId
  ) {
    return { action: 'ignore' };
  }

  // A learner who cancels keeps an open draft; other interruptions are failures.
  if (status === 'cancelled') {
    return { action: 'release', status: 'open', reason: 'cancelled' };
  }

  if (status !== 'completed') {
    return { action: 'release', status: 'failed', reason: status };
  }

  if (!candidate) {
    return { action: 'release', status: 'failed', reason: 'invalid_output' };
  }

  return { action: 'consolidate', roadmap: candidate };
}
