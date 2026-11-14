import { describe, expect, it } from 'vitest';
import {
  assertPublished,
  cardConcepts,
  pageOffset,
  recommendationCandidate,
} from './catalog.js';
import type { Publication, PublicDefinition } from './community.js';

const publication: Publication = {
  roadmapId: 'roadmap-1',
  publishedByUserId: 'author',
  authorName: 'Ana',
  level: 'beginner',
  upvotes: 0,
  downvotes: 0,
  score: 0,
  publishedAt: new Date('2026-11-05T10:00:00Z'),
};

function step(id: string, concepts: string[]) {
  return {
    id,
    title: `Step ${id}`,
    content: 'Content.',
    concepts,
    challenge: {
      instructions: 'Do it.',
      criteria: [{ id: 'done', description: 'Done.' }],
    },
  };
}

describe('catalog rules', () => {
  it('pages twelve roadmaps at a time', () => {
    expect(pageOffset(1)).toBe(0);
    expect(pageOffset(3)).toBe(24);
  });

  it('lists distinct concepts in step order, at most six', () => {
    const definition: PublicDefinition = {
      title: 'T',
      description: 'D',
      starterFiles: {},
      steps: [
        step('a', ['SQL', 'Keys', 'Indexes']),
        step('b', ['sql', 'Joins', 'Views', 'Triggers', 'Roles']),
      ],
    };

    const concepts = cardConcepts(definition);

    expect(concepts).toEqual([
      'SQL',
      'Keys',
      'Indexes',
      'Joins',
      'Views',
      'Triggers',
    ]);
  });

  it('hides unpublished roadmaps', () => {
    expect(() => assertPublished(null)).toThrow(
      expect.objectContaining({ kind: 'not_found' }),
    );
    expect(assertPublished(publication)).toBe(publication);
  });

  it('gives Seymour public text only', () => {
    const candidate = recommendationCandidate({
      id: 'roadmap-1',
      authorUserId: 'secret-author',
      definition: {
        title: 'T',
        description: 'D',
        level: 'advanced',
        starterFiles: { 'a.ts': 'private?' },
        steps: [step('a', ['SQL'])],
      },
    });

    expect(candidate).toEqual({
      roadmapId: 'roadmap-1',
      title: 'T',
      description: 'D',
      level: 'advanced',
      concepts: ['SQL'],
      steps: ['Step a'],
    });
  });
});
