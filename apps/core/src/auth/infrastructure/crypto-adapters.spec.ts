import { EncryptJWT } from 'jose';
import { createHash } from 'node:crypto';
import { ArgonPasswords } from './argon-passwords.js';
import { JweTokens } from './jwe-tokens.js';
import { OpaqueRefreshTokens } from './opaque-refresh-tokens.js';

const key = 'ab'.repeat(32);
const keys = JSON.stringify({ test: key });

function codec() {
  return new JweTokens('test', keys);
}

describe('Authentication crypto adapters', () => {
  it('salts Argon2id hashes and verifies only the correct password', async () => {
    const passwords = new ArgonPasswords();

    const first = await passwords.hash('study123');
    const second = await passwords.hash('study123');

    expect(first).toMatch(/^\$argon2id\$/);
    expect(first).not.toBe(second);
    expect(await passwords.verify(first, 'study123')).toBe(true);
    expect(await passwords.verify(first, 'wrong')).toBe(false);
  });

  it('round-trips identity and rejects expired tokens and altered ciphertext', async () => {
    const tokens = codec();
    const token = await tokens.issue(
      'user',
      'session',
      'token',
      new Date(Date.now() + 60_000),
    );

    expect(await tokens.read(token)).toEqual({
      userId: 'user',
      sessionId: 'session',
      tokenId: 'token',
    });

    const parts = token.split('.');
    parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);

    await expect(tokens.read(parts.join('.'))).rejects.toThrow();

    const expired = await tokens.issue(
      'user',
      'session',
      'token',
      new Date(Date.now() - 1000),
    );

    await expect(tokens.read(expired)).rejects.toThrow();
  });

  it('rejects wrong issuer, audience and missing identity claims', async () => {
    const tokens = codec();

    for (const [issuer, audience, subject, sessionId, tokenId] of [
      ['other-service', 'papert-web', 'user', 'session', 'token'],
      ['papert-core', 'other-client', 'user', 'session', 'token'],
      ['papert-core', 'papert-web', undefined, 'session', 'token'],
      ['papert-core', 'papert-web', 'user', undefined, 'token'],
      ['papert-core', 'papert-web', 'user', 'session', undefined],
    ]) {
      const claims = { sub: subject, sid: sessionId, jti: tokenId };
      const token = await new EncryptJWT(claims)
        .setProtectedHeader({
          alg: 'dir',
          enc: 'A256GCM',
          kid: 'test',
          typ: 'JWT',
        })
        .setIssuer(issuer!)
        .setAudience(audience!)
        .setIssuedAt()
        .setExpirationTime('15m')
        .encrypt(Buffer.from(key, 'hex'));

      await expect(tokens.read(token)).rejects.toThrow();
    }
  });

  it('accepts retained keys and rejects retired or unknown keys and invalid configuration', async () => {
    const token = await codec().issue(
      'user',
      'session',
      'token',
      new Date(Date.now() + 60_000),
    );
    const rotated = new JweTokens(
      'new',
      JSON.stringify({ test: key, new: 'cd'.repeat(32) }),
    );
    const retired = new JweTokens(
      'new',
      JSON.stringify({ new: 'cd'.repeat(32) }),
    );

    expect((await rotated.read(token)).userId).toBe('user');
    await expect(retired.read(token)).rejects.toThrow();
    expect(() => new JweTokens('bad', '{}')).toThrow();
    expect(() => new JweTokens('bad', 'invalid JSON')).toThrow(
      'AUTH_JWE_KEYS must be a valid JSON key map.',
    );
  });

  it('generates unique 256-bit refresh tokens stored only as SHA-256 hashes', () => {
    const refreshTokens = new OpaqueRefreshTokens();

    const first = refreshTokens.generate();
    const second = refreshTokens.generate();

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toBe(
      createHash('sha256').update(first.token).digest('hex'),
    );
    expect(refreshTokens.hash(first.token)).toBe(first.hash);
  });

  it('rejects values that cannot be refresh tokens before hashing', () => {
    const refreshTokens = new OpaqueRefreshTokens();

    for (const value of ['', 'short', 'a'.repeat(44), `${'a'.repeat(42)}=`]) {
      expect(refreshTokens.hash(value)).toBeNull();
    }
  });
});
