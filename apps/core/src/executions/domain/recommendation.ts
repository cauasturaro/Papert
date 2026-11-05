import type { GenerationLevel } from './roadmap-drafts.js';

export type RecommendationRequest = {
  requestKey: string;
  kind: 'recommendation';
};

/** Public text of a published roadmap Seymour may compare with the goal. */
export type RecommendationCandidate = {
  roadmapId: string;
  title: string;
  description: string;
  level: GenerationLevel | null;
  concepts: string[];
  steps: string[];
};

/** Roadmap IDs Core offered to Seymour in a recommendation snapshot. */
export function offeredRoadmapIds(input: unknown) {
  const snapshot = input as { candidates?: { roadmapId?: unknown }[] };

  if (!Array.isArray(snapshot.candidates)) {
    return [];
  }

  return snapshot.candidates
    .map((candidate) => candidate.roadmapId)
    .filter((id): id is string => typeof id === 'string');
}
