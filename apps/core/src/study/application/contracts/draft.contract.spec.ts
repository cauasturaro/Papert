import { describe, expect, it } from 'vitest';
import { GOAL_MAX, GOAL_MIN } from '../../domain/roadmap-draft.js';
import { createDraftSchema, emptyBodySchema } from './draft.contract.js';

describe('createDraftSchema', () => {
  it('accepts goals within the length limits after trimming', () => {
    const shortest = { goal: `  ${'g'.repeat(GOAL_MIN)}  `, level: 'beginner' };
    const longest = { goal: 'g'.repeat(GOAL_MAX), level: 'advanced' };

    const result = createDraftSchema.safeParse(shortest);

    expect(result.success).toBe(true);
    expect(result.data?.goal).toBe('g'.repeat(GOAL_MIN));
    expect(createDraftSchema.safeParse(longest).success).toBe(true);
  });

  it('rejects goals outside the limits, unknown levels and extra fields', () => {
    const tooShort = {
      goal: `  ${'g'.repeat(GOAL_MIN - 1)}  `,
      level: 'beginner',
    };
    const tooLong = { goal: 'g'.repeat(GOAL_MAX + 1), level: 'beginner' };
    const unknownLevel = { goal: 'Learn TypeScript generics', level: 'expert' };
    const extraField = {
      goal: 'Learn TypeScript generics',
      level: 'intermediate',
      sourceIds: [],
    };

    for (const body of [tooShort, tooLong, unknownLevel, extraField]) {
      expect(createDraftSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe('emptyBodySchema', () => {
  it('accepts only an empty object', () => {
    expect(emptyBodySchema.safeParse({}).success).toBe(true);
    expect(emptyBodySchema.safeParse({ force: true }).success).toBe(false);
    expect(emptyBodySchema.safeParse(undefined).success).toBe(false);
  });
});
