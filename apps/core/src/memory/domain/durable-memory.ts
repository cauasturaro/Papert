import { MemoryError } from './memory.js';
import type { MemoryItem, MemoryKind } from './memory.js';
import {
  assertValidText,
  normalizedText,
  sameText,
  similarText,
  validLength,
} from './memory-text.js';

export const MAX_ACTIVE_ITEMS = 30;
export const MAX_PENDING_PROPOSALS = 5;
export const PROPOSAL_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// What one tutor request may carry: the newest active items within both limits.
export const CONTEXT_ITEMS = 10;
export const CONTEXT_CHARACTERS = 1200;

export function assertUnique(
  text: string,
  items: MemoryItem[],
  exceptId?: string,
) {
  const duplicate = items.some(
    (item) => item.id !== exceptId && sameText(item.text, text),
  );

  if (duplicate) {
    throw new MemoryError('conflict', 'Seymour already remembers this.');
  }
}

/** Creating or accepting an active item must stay within the active limit. */
export function assertCanActivate(items: MemoryItem[]) {
  const active = items.filter((item) => item.status === 'active').length;

  if (active >= MAX_ACTIVE_ITEMS) {
    throw new MemoryError(
      'conflict',
      `Seymour keeps at most ${MAX_ACTIVE_ITEMS} memories. Delete one first.`,
    );
  }
}

export function proposalExpiry(now: Date) {
  return new Date(now.getTime() + PROPOSAL_TTL_MS);
}

export function isExpired(item: MemoryItem, now: Date) {
  return item.expiresAt !== null && item.expiresAt <= now;
}

/**
 * A Seymour proposal is kept only when it is new, valid and the learner still has room
 * to review it. It never becomes active without the learner.
 */
export function proposalDecision(
  proposal: { kind: MemoryKind; text: string } | null,
  items: MemoryItem[],
  now: Date,
): { kind: MemoryKind; text: string } | null {
  if (!proposal) {
    return null;
  }

  const text = normalizedText(proposal.text);
  if (!validLength(text)) {
    return null;
  }

  const current = items.filter((item) => !isExpired(item, now));
  const duplicate = current.some((item) => similarText(item.text, text));
  const pending = current.filter((item) => item.status === 'proposed').length;

  if (duplicate || pending >= MAX_PENDING_PROPOSALS) {
    return null;
  }

  return { kind: proposal.kind, text };
}

/** Active items for a tutor request, newest first, within the item and character limits. */
export function contextItems(items: MemoryItem[]) {
  const active = items
    .filter((item) => item.status === 'active')
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const selected: { id: string; kind: MemoryKind; text: string }[] = [];
  let characters = 0;

  for (const item of active) {
    if (selected.length === CONTEXT_ITEMS) {
      break;
    }

    if (characters + item.text.length > CONTEXT_CHARACTERS) {
      continue;
    }

    characters += item.text.length;
    selected.push({ id: item.id, kind: item.kind, text: item.text });
  }

  return selected;
}

/** A validated write the repository applies to a learner's items under their lock. */
export type MemoryWrite =
  | { action: 'create'; kind: MemoryKind; text: string }
  | { action: 'update'; id: string; kind: MemoryKind; text: string }
  | { action: 'activate'; id: string };

/** Items a deletion removes under the learner's lock. */
export type MemoryRemoval = { ids: string[] };

function existing(items: MemoryItem[], id: string) {
  const item = items.find((candidate) => candidate.id === id);

  if (!item) {
    throw new MemoryError('not_found', 'Memory not found.');
  }

  return item;
}

export function createChange(
  items: MemoryItem[],
  input: { kind: MemoryKind; text: string },
): MemoryWrite {
  const text = normalizedText(input.text);

  assertValidText(text);
  assertUnique(text, items);
  assertCanActivate(items);

  return { action: 'create', kind: input.kind, text };
}

/** Editing keeps the status: an edited proposal still waits for the learner. */
export function updateChange(
  items: MemoryItem[],
  id: string,
  input: { kind?: MemoryKind; text?: string },
): MemoryWrite {
  const item = existing(items, id);
  const text = normalizedText(input.text ?? item.text);

  assertValidText(text);
  assertUnique(text, items, id);

  return { action: 'update', id, kind: input.kind ?? item.kind, text };
}

export function acceptChange(items: MemoryItem[], id: string): MemoryWrite {
  const item = existing(items, id);

  if (item.status === 'proposed') {
    assertCanActivate(items);
  }

  return { action: 'activate', id };
}

/**
 * Deleting an item also drops pending proposals that restate it, so a deleted memory cannot
 * come back through an old suggestion.
 */
export function removeChange(items: MemoryItem[], id: string): MemoryRemoval {
  const item = existing(items, id);

  const restating = items.filter(
    (candidate) =>
      candidate.id !== id &&
      candidate.status === 'proposed' &&
      similarText(candidate.text, item.text),
  );

  return { ids: [id, ...restating.map((candidate) => candidate.id)] };
}
