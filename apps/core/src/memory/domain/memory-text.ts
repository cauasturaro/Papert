import { MemoryError } from './memory.js';

// Text rules of a durable memory: normalization, length and when two texts say the same thing.

export const MIN_TEXT = 3;
export const MAX_TEXT = 200;

/** Trimmed, single-spaced text; uniqueness compares it case-insensitively. */
export function normalizedText(text: string) {
  return text.trim().replace(/\s+/g, ' ');
}

export function sameText(a: string, b: string) {
  return normalizedText(a).toLowerCase() === normalizedText(b).toLowerCase();
}

// Words that do not change what a note says ("Prefers short answers" = "Short answers").
const FILLER = new Set([
  'a',
  'an',
  'the',
  'in',
  'of',
  'to',
  'for',
  'and',
  'with',
  'please',
  'always',
  'prefer',
  'prefers',
  'like',
  'likes',
  'want',
  'wants',
]);
const SIMILARITY = 0.75;

function words(text: string) {
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

  // A plural or third-person "s" does not make a different note.
  const stems = tokens
    .filter((token) => !FILLER.has(token))
    .map((token) => (token.length > 3 ? token.replace(/s$/, '') : token));

  return new Set(stems);
}

/** Same meaning in other words, by word overlap; used to keep proposals from restating items. */
export function similarText(a: string, b: string) {
  const left = words(a);
  const right = words(b);

  if (left.size === 0 || right.size === 0) {
    return sameText(a, b);
  }

  const shared = [...left].filter((word) => right.has(word)).length;
  const union = new Set([...left, ...right]).size;

  return shared / union >= SIMILARITY;
}

/** Length in characters as learners count them (code points), within the stored limits. */
export function validLength(text: string) {
  const length = [...text].length;

  return length >= MIN_TEXT && length <= MAX_TEXT;
}

export function assertValidText(text: string) {
  if (!validLength(text)) {
    throw new MemoryError(
      'invalid',
      `A memory has between ${MIN_TEXT} and ${MAX_TEXT} characters.`,
    );
  }
}
