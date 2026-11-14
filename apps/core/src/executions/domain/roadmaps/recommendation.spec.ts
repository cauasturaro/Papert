import { describe, expect, it } from 'vitest';
import { offeredRoadmapIds } from './recommendation.js';

describe('offeredRoadmapIds', () => {
  it('reads roadmap IDs from a recommendation snapshot and ignores malformed ones', () => {
    const snapshot = {
      kind: 'recommendation',
      candidates: [{ roadmapId: 'hexagonal' }, { roadmapId: 7 }, {}],
    };

    expect(offeredRoadmapIds(snapshot)).toEqual(['hexagonal']);
    expect(offeredRoadmapIds({ kind: 'generation' })).toEqual([]);
    expect(offeredRoadmapIds({ candidates: 'none' })).toEqual([]);
  });
});
