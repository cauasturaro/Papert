import { describe, expect, it } from 'vitest';
import type { Publication } from './community.js';
import {
  assertVoteAllowed,
  toVote,
  voteChange,
  wilsonScore,
} from './ranking.js';

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

describe('wilsonScore', () => {
  it('is zero without votes and ranks more evidence above a lucky start', () => {
    const none = wilsonScore(0, 0);
    const single = wilsonScore(1, 0);
    const many = wilsonScore(40, 4);

    expect(none).toBe(0);
    expect(single).toBeGreaterThan(0);
    expect(many).toBeGreaterThan(single);
  });

  it('stays between 0 and 1 and drops with downvotes', () => {
    const liked = wilsonScore(10, 1);
    const disliked = wilsonScore(1, 10);

    expect(liked).toBeLessThanOrEqual(1);
    expect(disliked).toBeGreaterThanOrEqual(0);
    expect(liked).toBeGreaterThan(disliked);
  });
});

describe('voteChange', () => {
  const tally = { upvotes: 3, downvotes: 1 };

  it('adds, switches and removes a vote', () => {
    const added = voteChange(tally, 0, 1);
    const switched = voteChange(tally, 1, -1);
    const removed = voteChange(tally, -1, 0);

    expect(added).toMatchObject({ upvotes: 4, downvotes: 1 });
    expect(switched).toMatchObject({ upvotes: 2, downvotes: 2 });
    expect(removed).toMatchObject({ upvotes: 3, downvotes: 0 });
  });

  it('leaves counters unchanged when the vote repeats', () => {
    const repeated = voteChange(tally, 1, 1);

    expect(repeated).toEqual({
      upvotes: 3,
      downvotes: 1,
      score: wilsonScore(3, 1),
    });
  });
});

describe('vote rules', () => {
  it('forbids self-votes', () => {
    expect(() => assertVoteAllowed(publication, 'author')).toThrow(
      expect.objectContaining({ kind: 'forbidden' }),
    );
    expect(() => assertVoteAllowed(publication, 'reader')).not.toThrow();
    expect(() =>
      assertVoteAllowed({ ...publication, publishedByUserId: null }, 'reader'),
    ).not.toThrow();
  });

  it('reads stored votes as -1, 0 or 1', () => {
    expect(toVote(1)).toBe(1);
    expect(toVote(-1)).toBe(-1);
    expect(toVote(null)).toBe(0);
    expect(toVote(7)).toBe(0);
  });
});
