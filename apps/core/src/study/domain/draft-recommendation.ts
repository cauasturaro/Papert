import { StudyError } from './study.js';
import type { DraftStatus, GenerationStatus } from './roadmap-draft.js';

export const MAX_RECOMMENDATIONS = 3;

/** A published roadmap Seymour found close to the draft's goal. */
export type RecommendationMatch = {
  roadmapId: string;
  // Cosine similarity between goal and roadmap; higher is closer.
  similarity: number;
};

export type RecommendationStatus = 'searching' | 'ready' | 'failed';

/** The community check every draft goes through before a paid generation. */
export type DraftRecommendation = {
  executionId: string;
  status: RecommendationStatus;
  matches: RecommendationMatch[];
  // The learner saw the options (or the failure) and chose to generate anyway.
  declined: boolean;
};

function assertPreparing(status: DraftStatus | null) {
  if (status === null || status === 'discarded') {
    throw new StudyError('not_found', 'Roadmap draft not found.');
  }

  if (status === 'generating' || status === 'generated') {
    throw new StudyError('conflict', 'This draft is past the community check.');
  }
}

/** A new check may start on an open or failed draft that is not already searching. */
export function assertRecommendationAllowed(
  status: DraftStatus | null,
  recommendation: DraftRecommendation | null,
) {
  assertPreparing(status);

  if (recommendation?.status === 'searching') {
    throw new StudyError(
      'conflict',
      'Seymour is already checking the community catalog for this draft.',
    );
  }
}

/** The learner saw the community options (or there were none) and may generate now. */
export function choiceMade(recommendation: DraftRecommendation | null) {
  if (!recommendation || recommendation.status === 'searching') {
    return false;
  }

  const nothingToChoose =
    recommendation.status === 'ready' && recommendation.matches.length === 0;

  return nothingToChoose || recommendation.declined;
}

/** No paid generation before the learner has seen the community options. */
export function assertChoiceMade(recommendation: DraftRecommendation | null) {
  if (!recommendation || recommendation.status === 'searching') {
    throw new StudyError(
      'conflict',
      'Check the community roadmaps for your goal before generating a new one.',
    );
  }

  if (!choiceMade(recommendation)) {
    throw new StudyError(
      'conflict',
      'Choose a community roadmap or continue to generate your own.',
    );
  }
}

/** Declining is possible once the check has finished, with matches or with a failure. */
export function assertDeclineAllowed(
  status: DraftStatus | null,
  recommendation: DraftRecommendation | null,
): asserts recommendation is DraftRecommendation {
  assertPreparing(status);

  if (!recommendation || recommendation.status === 'searching') {
    throw new StudyError(
      'conflict',
      'Wait for the community check to finish before choosing.',
    );
  }
}

export type RecommendationDecision =
  | { action: 'ignore' }
  | { action: 'settle'; recommendation: DraftRecommendation };

/**
 * Applies a finished check once. Only the execution the draft waits for counts; matches keep
 * Seymour's order and only roadmaps Executions reports as offered and still published.
 */
export function recommendationDecision(
  current: DraftRecommendation | null,
  executionId: string,
  status: GenerationStatus,
  matches: RecommendationMatch[] | null,
  publishedIds: string[],
): RecommendationDecision {
  if (
    !current ||
    current.status !== 'searching' ||
    current.executionId !== executionId
  ) {
    return { action: 'ignore' };
  }

  if (status !== 'completed' || matches === null) {
    return {
      action: 'settle',
      recommendation: { ...current, status: 'failed', matches: [] },
    };
  }

  const published = new Set(publishedIds);
  const seen = new Set<string>();

  // Seymour already ranked them, level tie-break included; only filter here.
  const authorized = matches
    .filter((match) => {
      const allowed =
        published.has(match.roadmapId) && !seen.has(match.roadmapId);

      seen.add(match.roadmapId);

      return allowed;
    })
    .slice(0, MAX_RECOMMENDATIONS);

  return {
    action: 'settle',
    recommendation: { ...current, status: 'ready', matches: authorized },
  };
}
