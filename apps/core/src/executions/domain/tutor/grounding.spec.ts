import {
  admittedSourceIds,
  authorizedGrounding,
  liveSourceIds,
} from './grounding.js';
import type { Citation } from './grounding.js';

const KEPT = '11111111-1111-4111-8111-111111111111';
const DELETED = '22222222-2222-4222-8222-222222222222';

function citation(sourceId: string, quote: string | null = null): Citation {
  return {
    sourceId,
    cite: 'guide.pdf, p. 2',
    location: { page: 2 },
    excerpt: 'POST /orders',
    quote,
  };
}

describe('grounding', () => {
  it('keeps only admitted sources that are still ready', () => {
    const live = liveSourceIds([KEPT, DELETED], [KEPT, 'other']);

    expect(live).toEqual([KEPT]);
  });

  it('drops citations and quotes of sources deleted during the run', () => {
    const grounding = {
      support: 'cited' as const,
      citations: [citation(DELETED, 'secret quote'), citation(KEPT)],
    };

    const kept = authorizedGrounding(grounding, [KEPT]);
    const none = authorizedGrounding(grounding, []);

    expect(kept).toEqual({ support: 'cited', citations: [citation(KEPT)] });
    expect(none).toEqual({ support: 'unsupported', citations: [] });
  });

  it('reads admitted source ids from the execution snapshot', () => {
    const input = { sources: [{ id: KEPT }, { id: 3 }] };

    expect(admittedSourceIds(input)).toEqual([KEPT]);
    expect(admittedSourceIds({})).toEqual([]);
  });
});
