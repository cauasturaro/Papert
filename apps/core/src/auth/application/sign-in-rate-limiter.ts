import { AuthError } from '../domain/auth.js';
import type { AttemptStore, SignInLimiter } from '../domain/auth.js';

const RETRY_AFTER_SECONDS = 15 * 60;

export class SignInRateLimiter implements SignInLimiter {
  constructor(private readonly attempts: AttemptStore) {}

  async check(email: string, peer: string): Promise<void> {
    // shortcut: proxy users share the peer bucket; add edge IP limits before public hosting.
    for (const [key, limit] of [
      [`peer:${peer}`, 300],
      [`email:${email}`, 10],
    ] as const) {
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(key),
      );
      const attemptKey = Buffer.from(digest).toString('hex');

      const allowed = await this.attempts.consumeAttempt(
        attemptKey,
        limit,
        RETRY_AFTER_SECONDS,
      );

      if (!allowed) {
        throw new AuthError(
          'rate_limited',
          `Too many attempts. Please try again in ${RETRY_AFTER_SECONDS / 60} minutes.`,
          RETRY_AFTER_SECONDS,
        );
      }
    }
  }
}
