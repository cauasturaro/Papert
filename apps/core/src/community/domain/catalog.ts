import { CommunityError } from './community.js';
import type {
  CatalogLevel,
  CommunityRoadmap,
  PublicDefinition,
} from './community.js';

export const CATALOG_PAGE_SIZE = 12;
export const CATALOG_MAX_PAGE = 500;
const CARD_CONCEPTS = 6;
// Cards requested by ID at once, such as recommendation matches.
export const MAX_IDS = 24;
// Saved roadmaps listed at once, most recent first.
export const LIBRARY_LIMIT = 100;
// Candidates Seymour compares with a goal; larger catalogs need indexing at publication.
export const RECOMMENDATION_CANDIDATES = 50;

export function pageOffset(page: number) {
  return (page - 1) * CATALOG_PAGE_SIZE;
}

/** Distinct concepts in step order, for a compact card. */
export function cardConcepts(definition: PublicDefinition) {
  const seen = new Map<string, string>();

  for (const step of definition.steps) {
    for (const concept of step.concepts ?? []) {
      const key = concept.toLowerCase();

      if (!seen.has(key)) {
        seen.set(key, concept);
      }
    }
  }

  return [...seen.values()].slice(0, CARD_CONCEPTS);
}

export function assertPublished<T>(publication: T | null): T {
  if (!publication) {
    throw new CommunityError('not_found', 'Community roadmap not found.');
  }

  return publication;
}

/** Public text Seymour compares with a learner's goal; nothing about the author. */
export type RecommendationCandidate = {
  roadmapId: string;
  title: string;
  description: string;
  level: CatalogLevel | null;
  concepts: string[];
  steps: string[];
};

export function recommendationCandidate(
  roadmap: CommunityRoadmap,
): RecommendationCandidate {
  const { definition } = roadmap;

  return {
    roadmapId: roadmap.id,
    title: definition.title,
    description: definition.description,
    level: definition.level ?? null,
    concepts: cardConcepts(definition),
    steps: definition.steps.map((step) => step.title),
  };
}
