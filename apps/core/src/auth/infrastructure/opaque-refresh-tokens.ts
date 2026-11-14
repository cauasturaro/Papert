import { createHash, randomBytes } from 'node:crypto';
import type { RefreshTokens } from '../domain/ports/refresh-tokens.js';

const REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// 256 random bits need no slow hash: the hash only protects tokens at rest.
export class OpaqueRefreshTokens implements RefreshTokens {
  generate() {
    const token = randomBytes(32).toString('base64url');

    return { token, hash: this.digest(token) };
  }

  hash(token: string) {
    if (!REFRESH_TOKEN_PATTERN.test(token)) {
      return null;
    }

    return this.digest(token);
  }

  private digest(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
