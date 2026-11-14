import { describe, expect, it } from 'vitest';
import {
  acceptChange,
  contextItems,
  createChange,
  MAX_ACTIVE_ITEMS,
  MAX_PENDING_PROPOSALS,
  proposalDecision,
  removeChange,
  updateChange,
} from './durable-memory.js';
import { MemoryError } from './memory.js';
import type { MemoryItem } from './memory.js';

const now = new Date('2026-11-05T12:00:00Z');

function item(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: 'item-1',
    kind: 'preference',
    text: 'Show examples in Python',
    status: 'active',
    origin: 'learner',
    executionId: null,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function manyActive(count: number) {
  return Array.from({ length: count }, (_, index) =>
    item({ id: `item-${index}`, text: `Preference number ${index}` }),
  );
}

describe('creating and editing durable memories', () => {
  it('normalizes whitespace and rejects duplicates regardless of case', () => {
    const change = createChange([], {
      kind: 'difficulty',
      text: '  Async   errors  ',
    });

    expect(change).toEqual({
      action: 'create',
      kind: 'difficulty',
      text: 'Async errors',
    });
    expect(() =>
      createChange([item()], {
        kind: 'preference',
        text: ' show EXAMPLES in python ',
      }),
    ).toThrow(MemoryError);
  });

  it('keeps at most the active limit', () => {
    const full = manyActive(MAX_ACTIVE_ITEMS);

    expect(() =>
      createChange(full, { kind: 'preference', text: 'One more' }),
    ).toThrow(MemoryError);
  });

  it('edits text and kind while keeping a proposal waiting', () => {
    const proposal = item({
      status: 'proposed',
      origin: 'seymour',
      expiresAt: now,
    });

    const change = updateChange([proposal], 'item-1', {
      text: 'Prefers Python',
    });

    expect(change).toEqual({
      action: 'update',
      id: 'item-1',
      kind: 'preference',
      text: 'Prefers Python',
    });
  });

  it('may keep its own text and fails for an unknown item', () => {
    const change = updateChange([item()], 'item-1', { kind: 'difficulty' });

    expect(change).toMatchObject({
      kind: 'difficulty',
      text: 'Show examples in Python',
    });
    expect(() =>
      updateChange([item()], 'missing', { kind: 'difficulty' }),
    ).toThrow(MemoryError);
  });

  it('accepts a proposal only while there is room', () => {
    const proposal = item({
      id: 'proposal',
      status: 'proposed',
      text: 'Use analogies',
    });
    const full = [...manyActive(MAX_ACTIVE_ITEMS), proposal];

    expect(acceptChange([proposal], 'proposal')).toEqual({
      action: 'activate',
      id: 'proposal',
    });
    expect(() => acceptChange(full, 'proposal')).toThrow(MemoryError);
  });
});

describe('Seymour proposals', () => {
  it('keeps a new valid proposal and normalizes it', () => {
    const decision = proposalDecision(
      { kind: 'preference', text: ' Use  analogies ' },
      [],
      now,
    );

    expect(decision).toEqual({ kind: 'preference', text: 'Use analogies' });
  });

  it('skips restatements, invalid text and a full review queue', () => {
    const pending = Array.from({ length: MAX_PENDING_PROPOSALS }, (_, index) =>
      item({
        id: `p-${index}`,
        status: 'proposed',
        text: `Pending ${index}`,
        expiresAt: new Date(now.getTime() + 1000),
      }),
    );

    expect(
      proposalDecision(
        { kind: 'preference', text: 'Shows examples in PYTHON' },
        [item()],
        now,
      ),
    ).toBeNull();
    expect(
      proposalDecision({ kind: 'preference', text: 'no' }, [], now),
    ).toBeNull();
    expect(
      proposalDecision({ kind: 'difficulty', text: 'Closures' }, pending, now),
    ).toBeNull();
    expect(proposalDecision(null, [], now)).toBeNull();
  });

  it('ignores expired proposals when checking room and duplicates', () => {
    const expired = item({
      status: 'proposed',
      text: 'Closures',
      expiresAt: new Date(now.getTime() - 1),
    });

    const decision = proposalDecision(
      { kind: 'difficulty', text: 'Closures' },
      [expired],
      now,
    );

    expect(decision).toEqual({ kind: 'difficulty', text: 'Closures' });
  });
});

describe('items sent to the tutor', () => {
  it('sends active items only, newest first, within the limits', () => {
    const older = item({
      id: 'old',
      text: 'Older',
      updatedAt: new Date('2026-11-01'),
    });
    const newer = item({
      id: 'new',
      text: 'Newer',
      updatedAt: new Date('2026-11-04'),
    });
    const proposal = item({
      id: 'proposal',
      text: 'Proposal',
      status: 'proposed',
    });
    const huge = item({
      id: 'huge',
      text: 'x'.repeat(1194),
      updatedAt: new Date('2026-11-03'),
    });

    const selected = contextItems([older, proposal, huge, newer]);

    expect(selected.map((note) => note.id)).toEqual(['new', 'huge']);
  });

  it('stops at ten items', () => {
    const selected = contextItems(manyActive(15));

    expect(selected).toHaveLength(10);
  });
});

describe('deleting a memory', () => {
  it('removes pending proposals that restate a deleted item', () => {
    const note = item({ id: 'note', text: 'Show code examples in Python' });
    const restating = item({
      id: 'restating',
      status: 'proposed',
      origin: 'seymour',
      text: 'Shows code examples in Python',
    });
    const unrelated = item({
      id: 'unrelated',
      status: 'proposed',
      text: 'Use analogies',
    });

    const change = removeChange([note, restating, unrelated], 'note');

    expect(change).toEqual({ ids: ['note', 'restating'] });
    expect(() => removeChange([note], 'missing')).toThrow(MemoryError);
  });
});
