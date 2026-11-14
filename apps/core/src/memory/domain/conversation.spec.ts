import { describe, expect, it } from 'vitest';
import { conversationTitle, summaryAdvances } from './conversation.js';

describe('conversation titles', () => {
  it('collapses whitespace and shortens long prompts', () => {
    const short = conversationTitle('  How do   ports work? ');
    const long = conversationTitle('a'.repeat(120));

    expect(short).toBe('How do ports work?');
    expect(Array.from(long!)).toHaveLength(80);
    expect(long!.endsWith('…')).toBe(true);
    expect(conversationTitle('   ')).toBeNull();
  });
});

describe('summary cursors', () => {
  const at = new Date('2026-11-05T10:00:00Z');

  it('advances only past the stored cursor', () => {
    const stored = { id: 'b', at };

    expect(summaryAdvances(null, stored)).toBe(true);
    expect(summaryAdvances(stored, { id: 'b', at })).toBe(false);
    expect(summaryAdvances(stored, { id: 'a', at })).toBe(false);
    expect(summaryAdvances(stored, { id: 'c', at })).toBe(true);
    expect(
      summaryAdvances(stored, { id: 'a', at: new Date(at.getTime() + 1) }),
    ).toBe(true);
  });
});
