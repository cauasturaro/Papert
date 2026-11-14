import { CommunityError } from './community.js';
import type { CommunityRoadmap, PublicDefinition } from './community.js';

const AUTHOR_NAME_MIN = 2;
const AUTHOR_NAME_MAX = 40;
export const PAPERT_AUTHOR_NAME = 'Papert';

const RESERVED_NAMES = ['papert', 'seymour'];

// Storage links and keys that must never leave the author's workspace.
const STORAGE_PATTERNS = [
  /x-amz-(signature|credential|security-token|algorithm)/i,
  /https?:\/\/[^\s]*(amazonaws\.com|s3[.-])/i,
  /\b(documents|renditions)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i,
];

export type PublicationProblem = 'source_filename' | 'storage_link';

/** Only the author of a generated roadmap may publish it; Papert publishes its own. */
export function assertPublishable(
  roadmap: CommunityRoadmap | null,
  userId: string,
): asserts roadmap is CommunityRoadmap {
  if (!roadmap) {
    throw new CommunityError('not_found', 'Roadmap not found.');
  }

  if (roadmap.authorUserId !== userId) {
    throw new CommunityError(
      'forbidden',
      'Only the author of a roadmap can publish it.',
    );
  }
}

export type AuthorNameProblem = 'length' | 'characters' | 'reserved';

export function authorNameProblem(name: string): AuthorNameProblem | null {
  // Code points, like the database's char_length check.
  const length = Array.from(name).length;

  if (length < AUTHOR_NAME_MIN || length > AUTHOR_NAME_MAX) {
    return 'length';
  }

  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(name)) {
    return 'characters';
  }

  const normalized = name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

  if (RESERVED_NAMES.some((reserved) => normalized.includes(reserved))) {
    return 'reserved';
  }

  return null;
}

/** Every piece of text a published roadmap shows, identifiers and starter files included. */
function publicText(definition: PublicDefinition) {
  const parts = [definition.title, definition.description];

  for (const step of definition.steps) {
    parts.push(step.id, step.title, step.content, step.challenge.instructions);
    parts.push(...(step.concepts ?? []), ...(step.requires ?? []));

    for (const criterion of step.challenge.criteria) {
      parts.push(criterion.id, criterion.description);
    }
  }

  for (const [path, content] of Object.entries(definition.starterFiles)) {
    parts.push(path, content);
  }

  return parts.join('\n');
}

/**
 * Deterministic guard against private references in text that becomes public. Sources stay in
 * the author's workspace, so naming one or linking to storage would leak what publishing hides.
 */
export function publicationProblem(
  definition: PublicDefinition,
  privateFilenames: string[],
): PublicationProblem | null {
  const text = publicText(definition);
  const lowered = text.toLowerCase();

  const named = privateFilenames.some((filename) => {
    const name = filename.trim().toLowerCase();

    return name.length > 0 && lowered.includes(name);
  });

  if (named) {
    return 'source_filename';
  }

  if (STORAGE_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'storage_link';
  }

  return null;
}

/** Weighted text for full-text search: title, then concepts and steps, then description. */
export function searchText(definition: PublicDefinition) {
  const concepts = definition.steps.flatMap((step) => step.concepts ?? []);
  const steps = definition.steps.map((step) => step.title);

  return {
    title: definition.title,
    topics: [...concepts, ...steps].join(' '),
    description: definition.description,
  };
}
