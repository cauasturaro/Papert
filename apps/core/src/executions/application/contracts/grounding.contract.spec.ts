import { parseGrounding } from './grounding.contract.js';

const SOURCE = '11111111-1111-4111-8111-111111111111';

function grounding(location: unknown) {
  return {
    support: 'cited',
    citations: [
      {
        sourceId: SOURCE,
        cite: 'notes.md, lines 3-9',
        location,
        excerpt: 'text',
        quote: null,
      },
    ],
  };
}

describe('parseGrounding', () => {
  it('accepts the location of every ingested format', () => {
    const locations = [
      { page: 2 },
      { lineStart: 3, lineEnd: 9, headings: ['Setup', 'Replay window'] },
      { paragraphStart: 1, paragraphEnd: 6, heading: 'Handbook' },
      { paragraphStart: 1, paragraphEnd: 5, heading: null },
    ];

    const parsed = locations.map((location) =>
      parseGrounding(grounding(location)),
    );

    expect(parsed.every((item) => item !== null)).toBe(true);
  });

  it('drops malformed grounding instead of trusting it', () => {
    const unknownKey = parseGrounding(grounding({ page: 2, url: 'x' }));
    const foreignId = parseGrounding({
      ...grounding({ page: 2 }),
      citations: [{ ...grounding({ page: 2 }).citations[0], sourceId: 'x' }],
    });

    expect(unknownKey).toBeNull();
    expect(foreignId).toBeNull();
  });
});
