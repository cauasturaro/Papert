import { describe, expect, it } from 'vitest';
import {
  correctedQuery,
  prefixDistance,
  prefixQuery,
  searchTerms,
} from './catalog-search.js';

const vocabulary = [
  { word: 'postgresql', documents: 4 },
  { word: 'javascript', documents: 6 },
  { word: 'java', documents: 2 },
  { word: 'constraints', documents: 3 },
  { word: 'designing', documents: 1 },
  { word: 'react', documents: 5 },
  { word: 'redis', documents: 1 },
];

describe('catalog search', () => {
  it('splits a query into lowercase words and marks excluded ones', () => {
    const terms = searchTerms('Node.js  -Java full-stack');

    expect(terms).toEqual([
      { word: 'node', excluded: false },
      { word: 'js', excluded: false },
      { word: 'java', excluded: true },
      { word: 'full', excluded: false },
      { word: 'stack', excluded: false },
    ]);
  });

  it('matches every word as a prefix and keeps exclusions exact', () => {
    expect(prefixQuery('postgres')).toBe('postgres:*');
    expect(prefixQuery('react -redux c')).toBe('react:* & !redux & c');
    expect(prefixQuery("C++ & (Rust) | 'go'")).toBe('c & rust:* & go:*');
  });

  it('leaves phrases and exclusion-only queries without a prefix query', () => {
    expect(prefixQuery('"event loop"')).toBeNull();
    expect(prefixQuery('-java')).toBeNull();
    expect(prefixQuery('!!!')).toBeNull();
  });

  it('counts edits to the closest beginning of a word', () => {
    expect(prefixDistance('postgres', 'postgresql')).toBe(0);
    expect(prefixDistance('postgrse', 'postgresql')).toBe(1);
    expect(prefixDistance('javscript', 'javascript')).toBe(1);
    expect(prefixDistance('pyhton', 'react')).toBeGreaterThan(2);
  });

  it('corrects misspelled words with the closest published word', () => {
    expect(correctedQuery('postgrse', vocabulary)).toBe('postgresql');
    expect(correctedQuery('javscript basics', vocabulary)).toBe(
      'javascript basics',
    );
    expect(correctedQuery('reakt', vocabulary)).toBe('react');
  });

  it('keeps known words, inflections, exclusions and short words as typed', () => {
    expect(correctedQuery('postgres constraint', vocabulary)).toBeNull();
    expect(correctedQuery('design', vocabulary)).toBeNull();
    expect(correctedQuery('constraintss', vocabulary)).toBeNull();
    expect(correctedQuery('rest -jav', vocabulary)).toBeNull();
    expect(correctedQuery('sourdough', vocabulary)).toBeNull();
  });

  it('keeps the other words when one of them is corrected', () => {
    expect(correctedQuery('postgrse -java', vocabulary)).toBe(
      'postgresql -java',
    );
  });
});
