import * as argon2 from 'argon2';
import { EncryptJWT, jwtDecrypt } from 'jose';
import type { Passwords, Tokens } from '../domain/auth.js';

export class ArgonPasswords implements Passwords {
  hash(password: string) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  verify(hash: string, password: string) {
    return argon2.verify(hash, password);
  }
}

export class JweTokens implements Tokens {
  private readonly keys = new Map<string, Uint8Array>();

  constructor(
    private readonly activeKid: string,
    encodedKeys: string,
  ) {
    let entries: unknown;

    try {
      entries = JSON.parse(encodedKeys);
    } catch {
      throw new Error('AUTH_JWE_KEYS must be a valid JSON key map.');
    }

    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
      throw new Error('AUTH_JWE_KEYS must be a key map.');
    }

    for (const [kid, value] of Object.entries(entries)) {
      if (
        !/^[a-zA-Z0-9_-]{1,64}$/.test(kid) ||
        typeof value !== 'string' ||
        !/^[a-fA-F0-9]{64}$/.test(value)
      ) {
        throw new Error('Each JWE key needs a kid and a 32-byte hex value.');
      }

      this.keys.set(kid, Buffer.from(value, 'hex'));
    }

    if (!this.keys.has(activeKid)) {
      throw new Error('AUTH_JWE_ACTIVE_KID is missing from AUTH_JWE_KEYS.');
    }
  }

  issue(userId: string, sessionId: string, tokenId: string, expiresAt: Date) {
    return new EncryptJWT({ sid: sessionId })
      .setProtectedHeader({
        alg: 'dir',
        enc: 'A256GCM',
        kid: this.activeKid,
        typ: 'JWT',
      })
      .setSubject(userId)
      .setJti(tokenId)
      .setIssuer('papert-core')
      .setAudience('papert-web')
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .encrypt(this.keys.get(this.activeKid)!);
  }

  async read(token: string) {
    const { payload, protectedHeader } = await jwtDecrypt(
      token,
      (header) => {
        const key =
          typeof header.kid === 'string'
            ? this.keys.get(header.kid)
            : undefined;
        if (!key) {
          throw new Error('Unknown encryption key.');
        }

        return key;
      },
      {
        issuer: 'papert-core',
        audience: 'papert-web',
        keyManagementAlgorithms: ['dir'],
        contentEncryptionAlgorithms: ['A256GCM'],
        requiredClaims: ['sub', 'sid', 'jti', 'iat', 'exp'],
        maxTokenAge: '15m',
      },
    );

    if (
      protectedHeader.typ !== 'JWT' ||
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      typeof payload.jti !== 'string'
    ) {
      throw new Error('Invalid identity.');
    }

    return {
      userId: payload.sub,
      sessionId: payload.sid,
      tokenId: payload.jti,
    };
  }
}
