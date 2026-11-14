import { describe, expect, it } from 'vitest';
import { AuthError } from '../../domain/auth.js';
import { parseCredentials } from './credentials.contract.js';

describe('parseCredentials', () => {
  it('normalizes the email and keeps the password untouched', () => {
    const body = { email: '  Student@Example.COM ', password: ' secret ' };

    const credentials = parseCredentials(body);

    expect(credentials).toEqual({
      email: 'student@example.com',
      password: ' secret ',
    });
  });

  it('rejects missing fields, malformed emails and empty passwords', () => {
    const invalidBodies = [
      null,
      {},
      { email: 'student@example.com' },
      { email: 'not-an-email', password: 'secret' },
      { email: 'student@example.com', password: '' },
      { email: 'student@example.com', password: 42 },
    ];

    for (const body of invalidBodies) {
      expect(() => parseCredentials(body)).toThrow(AuthError);
    }
  });

  it('limits passwords to 128 bytes rather than 128 characters', () => {
    const email = 'student@example.com';
    const asciiLimit = 'a'.repeat(128);
    const asciiOverLimit = 'a'.repeat(129);
    // 'é' takes two bytes in UTF-8, so 65 of them exceed the limit.
    const multibyteOverLimit = 'é'.repeat(65);

    expect(parseCredentials({ email, password: asciiLimit }).password).toBe(
      asciiLimit,
    );

    expect(() => parseCredentials({ email, password: asciiOverLimit })).toThrow(
      AuthError,
    );

    expect(() =>
      parseCredentials({ email, password: multibyteOverLimit }),
    ).toThrow(AuthError);
  });

  it('reports invalid credentials with the invalid kind', () => {
    const body = { email: 'bad', password: '' };

    const parsing = () => parseCredentials(body);

    expect(parsing).toThrow(expect.objectContaining({ kind: 'invalid' }));
  });

  it('accepts emails up to 254 characters and rejects longer ones', () => {
    const emailOfLength = (length: number) => {
      const local = 'a'.repeat(64);
      const labels = Array.from({ length: 3 }, () => 'b'.repeat(60));
      const last = 'c'.repeat(length - 252);

      return `${local}@${labels.join('.')}.${last}.com`;
    };
    const longestEmail = emailOfLength(254);
    const tooLongEmail = emailOfLength(255);

    expect(longestEmail).toHaveLength(254);
    expect(tooLongEmail).toHaveLength(255);

    expect(
      parseCredentials({ email: longestEmail, password: 'secret' }).email,
    ).toBe(longestEmail);

    expect(() =>
      parseCredentials({ email: tooLongEmail, password: 'secret' }),
    ).toThrow(AuthError);
  });
});
