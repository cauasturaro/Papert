import { describe, expect, it } from 'vitest';
import { MAX_IDS } from '../../domain/catalog.js';
import {
  catalogQuerySchema,
  idsSchema,
  parse,
  publishSchema,
} from './community.contract.js';

describe('community contract', () => {
  it('reads catalog queries with defaults and rejects unknown fields', () => {
    const query = parse(catalogQuerySchema, { q: '  sql ', page: '2' });

    expect(query).toEqual({ query: 'sql', level: null, sort: 'top', page: 2 });
    expect(() => parse(catalogQuerySchema, { order: 'top' })).toThrow(
      'Invalid community request',
    );
  });

  it('dedupes selected IDs and bounds them', () => {
    const tooMany = Array.from(
      { length: MAX_IDS + 1 },
      (_, index) => `r${index}`,
    );

    expect(parse(idsSchema, 'a,b,a')).toEqual(['a', 'b']);
    expect(() => parse(idsSchema, tooMany.join(','))).toThrow();
    expect(() => parse(idsSchema, 'Not An Id')).toThrow();
  });

  it('requires the acknowledgement to publish', () => {
    expect(() =>
      parse(publishSchema, { authorName: 'Ana', acknowledged: false }),
    ).toThrow();
  });
});
