import { describe, expect, it } from 'vitest';
import {
  assertChoiceMade,
  assertDeclineAllowed,
  assertRecommendationAllowed,
  choiceMade,
  recommendationDecision,
} from './draft-recommendation.js';
import type { DraftRecommendation } from './draft-recommendation.js';

const searching: DraftRecommendation = {
  executionId: 'execution-1',
  status: 'searching',
  matches: [],
  declined: false,
};

const withMatches: DraftRecommendation = {
  ...searching,
  status: 'ready',
  matches: [{ roadmapId: 'hexagonal', similarity: 0.6 }],
};

describe('community check before generation', () => {
  it('starts on open or failed drafts that are not already searching', () => {
    expect(() => assertRecommendationAllowed('open', null)).not.toThrow();
    expect(() =>
      assertRecommendationAllowed('failed', withMatches),
    ).not.toThrow();

    expect(() => assertRecommendationAllowed('open', searching)).toThrow(
      expect.objectContaining({ kind: 'conflict' }),
    );
    expect(() => assertRecommendationAllowed('generated', null)).toThrow(
      expect.objectContaining({ kind: 'conflict' }),
    );
    expect(() => assertRecommendationAllowed('discarded', null)).toThrow(
      expect.objectContaining({ kind: 'not_found' }),
    );
  });

  it('allows a paid generation only after the learner chose', () => {
    const empty = { ...withMatches, matches: [] };
    const declined = { ...withMatches, declined: true };
    const failed = { ...searching, status: 'failed' as const };

    expect(() => assertChoiceMade(null)).toThrow();
    expect(() => assertChoiceMade(searching)).toThrow();
    expect(() => assertChoiceMade(withMatches)).toThrow(
      expect.objectContaining({ kind: 'conflict' }),
    );
    expect(() => assertChoiceMade(failed)).toThrow();

    expect(() => assertChoiceMade(empty)).not.toThrow();
    expect(() => assertChoiceMade(declined)).not.toThrow();
    expect(() => assertChoiceMade({ ...failed, declined: true })).not.toThrow();
  });

  it('tells the draft view whether generation is unlocked', () => {
    const empty = { ...withMatches, matches: [] };

    expect(choiceMade(null)).toBe(false);
    expect(choiceMade(searching)).toBe(false);
    expect(choiceMade(withMatches)).toBe(false);

    expect(choiceMade(empty)).toBe(true);
    expect(choiceMade({ ...withMatches, declined: true })).toBe(true);
  });

  it('declines only a finished check', () => {
    expect(() => assertDeclineAllowed('open', withMatches)).not.toThrow();
    expect(() => assertDeclineAllowed('open', searching)).toThrow();
    expect(() => assertDeclineAllowed('open', null)).toThrow();
  });
});

describe('recommendationDecision', () => {
  // Executions passes the offered roadmaps that are still published.
  const published = ['hexagonal', 'rag', 'docker', 'level-match'];

  it('ignores results for executions the draft no longer waits for', () => {
    const late = recommendationDecision(
      searching,
      'execution-0',
      'completed',
      [],
      published,
    );
    const repeated = recommendationDecision(
      withMatches,
      'execution-1',
      'completed',
      [],
      published,
    );

    expect(late).toEqual({ action: 'ignore' });
    expect(repeated).toEqual({ action: 'ignore' });
  });

  it('keeps published, distinct matches in Seymour order, at most three', () => {
    const matches = [
      { roadmapId: 'level-match', similarity: 0.6 },
      { roadmapId: 'unpublished', similarity: 0.9 },
      { roadmapId: 'hexagonal', similarity: 0.7 },
      { roadmapId: 'hexagonal', similarity: 0.69 },
      { roadmapId: 'rag', similarity: 0.61 },
      { roadmapId: 'docker', similarity: 0.41 },
    ];

    const decision = recommendationDecision(
      searching,
      'execution-1',
      'completed',
      matches,
      published,
    );

    // A same-level roadmap Seymour ranked first stays first despite a lower similarity.
    expect(decision).toEqual({
      action: 'settle',
      recommendation: {
        ...searching,
        status: 'ready',
        matches: [
          { roadmapId: 'level-match', similarity: 0.6 },
          { roadmapId: 'hexagonal', similarity: 0.7 },
          { roadmapId: 'rag', similarity: 0.61 },
        ],
      },
    });
  });

  it('fails the check on failure, cancellation or malformed output', () => {
    const failed = recommendationDecision(
      searching,
      'execution-1',
      'failed',
      null,
      published,
    );
    const malformed = recommendationDecision(
      searching,
      'execution-1',
      'completed',
      null,
      published,
    );

    expect(failed).toMatchObject({ recommendation: { status: 'failed' } });
    expect(malformed).toMatchObject({ recommendation: { status: 'failed' } });
  });
});
