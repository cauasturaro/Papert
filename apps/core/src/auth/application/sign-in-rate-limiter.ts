import { createHash } from 'node:crypto';
import { AuthError } from '../domain/auth.js';
import type { AttemptStore } from '../domain/ports/attempt-store.js';
import type {
  RateLimitScope,
  SecurityEvents,
} from '../domain/ports/security-events.js';
import type { SignInLimiter } from '../domain/ports/sign-in-limiter.js';

const WINDOW_SECONDS = 15 * 60;

export const SIGN_IN_LIMITS = {
  peer: 300,
  accountPeerFailures: 10,
  // Backstop against distributed guessing; high enough that locking out a known account takes many clients.
  accountFailures: 100,
  // Bounds how fast one client can learn which emails are registered.
  registrationConflicts: 10,
} as const;

function attemptKey(scope: string) {
  return createHash('sha256').update(scope).digest('hex');
}

function peerKey(peer: string) {
  return attemptKey(`peer:${peer}`);
}

function accountPeerKey(email: string, peer: string) {
  return attemptKey(`account-peer:${JSON.stringify([email, peer])}`);
}

function accountKey(email: string) {
  return attemptKey(`account:${email}`);
}

function registrationKey(peer: string) {
  return attemptKey(`registration-conflict:${peer}`);
}

export class SignInRateLimiter implements SignInLimiter {
  constructor(
    private readonly attempts: AttemptStore,
    private readonly events: SecurityEvents,
  ) {}

  async admit(peer: string) {
    await this.consume(peerKey(peer), SIGN_IN_LIMITS.peer, 'client', peer);
  }

  // Reserving before verification keeps concurrent guesses within the limit.
  async reserve(email: string, peer: string) {
    await this.consume(
      accountPeerKey(email, peer),
      SIGN_IN_LIMITS.accountPeerFailures,
      'account_client',
      peer,
      email,
    );
    await this.consume(
      accountKey(email),
      SIGN_IN_LIMITS.accountFailures,
      'account',
      peer,
      email,
    );
  }

  async succeeded(email: string, peer: string) {
    await this.attempts.clearAttempts(accountPeerKey(email, peer));
    await this.attempts.releaseAttempt(accountKey(email));
  }

  async reserveRegistration(peer: string) {
    await this.consume(
      registrationKey(peer),
      SIGN_IN_LIMITS.registrationConflicts,
      'registration_conflict',
      peer,
    );
  }

  async registered(peer: string) {
    await this.attempts.releaseAttempt(registrationKey(peer));
  }

  private async consume(
    key: string,
    limit: number,
    scope: RateLimitScope,
    peer: string,
    email?: string,
  ) {
    const allowed = await this.attempts.consumeAttempt(
      key,
      limit,
      WINDOW_SECONDS,
    );

    if (!allowed) {
      this.events.record({ type: 'rate_limited', scope, peer, email });

      throw new AuthError(
        'rate_limited',
        `Too many attempts. Please try again in ${WINDOW_SECONDS / 60} minutes.`,
        WINDOW_SECONDS,
      );
    }
  }
}
