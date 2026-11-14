import { describe, expect, it } from 'vitest';
import { MemoryError } from './memory.js';
import {
  assertValidText,
  normalizedText,
  similarText,
  validLength,
} from './memory-text.js';

describe('memory text', () => {
  it('normalizes whitespace and counts code points', () => {
    expect(normalizedText('  Use   analogies ')).toBe('Use analogies');
    expect(validLength('ab')).toBe(false);
    expect(validLength('😀😀😀')).toBe(true);
    expect(validLength('x'.repeat(201))).toBe(false);
    expect(() => assertValidText('ab')).toThrow(MemoryError);
  });

  it('treats rewordings as the same note', () => {
    expect(
      similarText(
        'Show code examples in Python',
        'Shows code examples in Python',
      ),
    ).toBe(true);
    expect(similarText('Prefers short answers', 'Short answers, please')).toBe(
      true,
    );
    expect(
      similarText(
        'Show code examples in Python',
        'Explain closures with analogies',
      ),
    ).toBe(false);
  });
});
