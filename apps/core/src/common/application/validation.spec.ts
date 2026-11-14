import { z } from 'zod';
import { validate } from './validation.js';
import { cursorPageSchema } from './contracts/cursor-page.contract.js';
import { DomainError } from '../domain/domain-error.js';

const invalid = () => new DomainError('invalid', 'Invalid request.');

describe('validate', () => {
  it('returns coerced values and defaults from strict schemas', () => {
    const defaults = validate(cursorPageSchema, {}, invalid);
    const coerced = validate(cursorPageSchema, { limit: '5' }, invalid);

    expect(defaults).toEqual({ limit: 20 });
    expect(coerced).toEqual({ limit: 5 });
  });

  it.each([null, { limit: 0 }, { limit: 'invalid' }, { extra: true }])(
    'keeps Zod issues out of the domain error for %j',
    (input) => {
      const error = invalid();

      expect(() => validate(cursorPageSchema, input, () => error)).toThrow(
        error,
      );
      expect(error).toMatchObject({
        kind: 'invalid',
        message: 'Invalid request.',
      });
      expect(error).not.toHaveProperty('issues');
    },
  );

  it('keeps object stripping and transformations available to callers', () => {
    const schema = z.object({ name: z.string().trim() });
    const input = { name: ' learner ', ignored: true };

    const result = validate(schema, input, invalid);

    expect(result).toEqual({ name: 'learner' });
  });
});
