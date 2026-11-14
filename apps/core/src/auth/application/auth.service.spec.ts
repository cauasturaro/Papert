import { randomUUID } from 'node:crypto';
import {
  REFRESH_REUSE_GRACE_SECONDS,
  SESSION_SECONDS,
  TOKEN_SECONDS,
  AuthService,
} from './auth.service.js';
import { SignInRateLimiter } from './sign-in-rate-limiter.js';
import type { Passwords } from '../domain/ports/passwords.js';
import type { Tokens } from '../domain/ports/tokens.js';
import type { RefreshTokens } from '../domain/ports/refresh-tokens.js';
import type { AttemptStore } from '../domain/ports/attempt-store.js';
import type { AuthRepository } from '../domain/ports/auth-repository.js';
import type {
  SecurityEvent,
  SecurityEvents,
} from '../domain/ports/security-events.js';
import type { Account, RefreshState, Session } from '../domain/auth.js';

class FakePasswords implements Passwords {
  async hash(password: string) {
    return `hashed:${password}`;
  }

  async verify(hash: string, password: string) {
    return hash === `hashed:${password}`;
  }
}

class FakeTokens implements Tokens {
  private readonly claims = new Map<
    string,
    {
      userId: string;
      sessionId: string;
      tokenId: string;
    }
  >();

  async issue(userId: string, sessionId: string, tokenId: string) {
    const token = randomUUID();
    this.claims.set(token, { userId, sessionId, tokenId });

    return token;
  }

  async read(token: string) {
    const claims = this.claims.get(token);
    if (!claims) {
      throw new Error('Invalid token.');
    }

    return claims;
  }
}

class FakeRefreshTokens implements RefreshTokens {
  private issued = 0;

  generate() {
    const token = `refresh-${++this.issued}`;

    return { token, hash: `hash:${token}` };
  }

  hash(token: string) {
    return token.startsWith('refresh-') ? `hash:${token}` : null;
  }
}

type RefreshUpdate = { tokenId: string; refreshHash: string; rotatedAt: Date };

class MemoryRepository implements AuthRepository, AttemptStore {
  users: Account[] = [];
  sessions: (Session & RefreshState)[] = [];
  attempts = new Map<string, number>();

  async createUser(email: string, passwordHash: string) {
    if (this.users.some((user) => user.email === email)) {
      return null;
    }

    const id = randomUUID();
    this.users.push({ id, email, passwordHash });

    return { id, email };
  }

  async findUser(email: string) {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async createSession(
    userId: string,
    tokenId: string,
    expiresAt: Date,
    refreshHash: string,
  ) {
    const session = {
      id: randomUUID(),
      userId,
      tokenId,
      expiresAt,
      revokedAt: null,
      refreshHash,
      previousRefreshHash: null,
      refreshRotatedAt: null,
    };

    this.sessions.push(session);

    return session;
  }

  async findSession(id: string) {
    const session = this.sessions.find((value) => value.id === id);
    if (!session) {
      return null;
    }

    const {
      refreshHash: _refreshHash,
      previousRefreshHash: _previousRefreshHash,
      refreshRotatedAt: _refreshRotatedAt,
      ...fields
    } = this.withUser(session);

    return fields;
  }

  async findSessionByRefresh(hash: string) {
    const session = this.sessions.find(
      (value) =>
        value.refreshHash === hash || value.previousRefreshHash === hash,
    );

    return session ? this.withUser(session) : null;
  }

  async rotateRefresh(id: string, currentHash: string, next: RefreshUpdate) {
    const session = this.sessions.find(
      (value) =>
        value.id === id &&
        value.refreshHash === currentHash &&
        !value.revokedAt &&
        value.expiresAt > next.rotatedAt,
    );
    if (!session) {
      return false;
    }

    session.tokenId = next.tokenId;
    session.previousRefreshHash = currentHash;
    session.refreshHash = next.refreshHash;
    session.refreshRotatedAt = next.rotatedAt;

    return true;
  }

  async upgradeSession(id: string, oldTokenId: string, next: RefreshUpdate) {
    const session = this.sessions.find(
      (value) =>
        value.id === id &&
        value.tokenId === oldTokenId &&
        value.refreshHash === null &&
        !value.revokedAt,
    );
    if (!session) {
      return false;
    }

    session.tokenId = next.tokenId;
    session.refreshHash = next.refreshHash;
    session.refreshRotatedAt = next.rotatedAt;

    return true;
  }

  private withUser(session: Session & RefreshState) {
    const account = this.users.find((user) => user.id === session.userId)!;

    return { ...session, user: { id: account.id, email: account.email } };
  }

  async revokeSession(id: string, userId: string) {
    const session = this.sessions.find(
      (value) => value.id === id && value.userId === userId,
    );
    if (session) {
      session.revokedAt = new Date();
    }
  }

  async consumeAttempt(key: string, limit: number) {
    const count = (this.attempts.get(key) ?? 0) + 1;
    this.attempts.set(key, count);

    return count <= limit;
  }

  async releaseAttempt(key: string) {
    const count = this.attempts.get(key) ?? 0;
    this.attempts.set(key, Math.max(count - 1, 0));
  }

  async clearAttempts(key: string) {
    this.attempts.delete(key);
  }
}

class RecordedEvents implements SecurityEvents {
  events: SecurityEvent[] = [];

  record(event: SecurityEvent) {
    this.events.push(event);
  }
}

describe('Authentication policy', () => {
  let repo: MemoryRepository;
  let auth: AuthService;
  let tokens: FakeTokens;
  let events: RecordedEvents;
  let now: Date;

  const password = 'study passphrase';

  beforeEach(() => {
    let generated = 0;
    now = new Date('2026-11-03T23:59:59Z');

    repo = new MemoryRepository();
    tokens = new FakeTokens();
    events = new RecordedEvents();
    auth = new AuthService(
      repo,
      new FakePasswords(),
      tokens,
      new FakeRefreshTokens(),
      new SignInRateLimiter(repo, events),
      events,
      () => now,
      () => `generated-${++generated}`,
    );
  });

  it('registers normalized identities, hashes passwords and never returns hashes', async () => {
    const firstAccount = await auth.register(
      { email: 'Alice@EXAMPLE.com', password },
      'peer',
    );
    await auth.register({ email: 'bob@example.com', password }, 'peer');

    expect(firstAccount.user.email).toBe('alice@example.com');
    expect(JSON.stringify(firstAccount)).not.toContain('password');
    expect(repo.users[0].passwordHash).toBe(`hashed:${password}`);
    expect((await auth.authenticate(firstAccount.token)).user.id).toBe(
      firstAccount.user.id,
    );
  });

  it('keeps the password hash off authenticated principals', async () => {
    const grant = await auth.register(
      { email: 'alice@example.com', password },
      'peer',
    );

    const principal = await auth.authenticate(grant.token);

    expect(principal.user).toEqual({
      id: grant.user.id,
      email: 'alice@example.com',
    });
    expect(JSON.stringify(principal)).not.toContain('hashed:');
  });

  it('uses injected IDs and exact clock boundaries for session and token expiry', async () => {
    const registered = await auth.register(
      { email: 'clock@example.com', password },
      'peer',
    );
    const session = repo.sessions[0];

    expect(session.tokenId).toBe('generated-2');
    expect(session.expiresAt.getTime()).toBe(
      now.getTime() + SESSION_SECONDS * 1000,
    );
    expect(registered.expiresAt.getTime()).toBe(
      now.getTime() + TOKEN_SECONDS * 1000,
    );

    now = new Date(session.expiresAt.getTime() - 1000);
    const refreshed = await auth.refresh(registered.refreshToken, '', 'peer');

    expect(repo.sessions[0].tokenId).toBe('generated-3');
    expect(refreshed.expiresAt).toEqual(session.expiresAt);

    now = session.expiresAt;

    await expect(auth.authenticate(refreshed.token)).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
  });

  it('logs in to an existing account without creating another user', async () => {
    const credentials = { email: 'alice@example.com', password };
    const registered = await auth.register(credentials, 'peer');

    const loggedIn = await auth.login(
      { ...credentials, email: ' Alice@EXAMPLE.com ' },
      'peer',
    );

    expect(loggedIn.user).toEqual(registered.user);
    expect(loggedIn.sessionId).not.toBe(registered.sessionId);
    expect(repo.users).toHaveLength(1);
    expect(repo.sessions).toHaveLength(2);

    await expect(auth.register(credentials, 'peer')).rejects.toMatchObject({
      kind: 'conflict',
    });
    expect(repo.users).toHaveLength(1);
    expect(repo.sessions).toHaveLength(2);
  });

  it('rejects incorrect and unknown credentials identically', async () => {
    await auth.register({ email: 'alice@example.com', password }, 'peer');

    for (const email of ['alice@example.com', 'missing@example.com']) {
      await expect(
        auth.login({ email, password: 'wrong' }, 'peer'),
      ).rejects.toMatchObject({
        kind: 'unauthenticated',
        message: 'Email or password is incorrect.',
      });
    }

    expect(events.events).toEqual([
      {
        type: 'sign_in_failed',
        email: 'alice@example.com',
        peer: 'peer',
        knownAccount: true,
      },
      {
        type: 'sign_in_failed',
        email: 'missing@example.com',
        peer: 'peer',
        knownAccount: false,
      },
    ]);
    expect(JSON.stringify(events.events)).not.toContain('wrong');
  });

  it('rejects passwords under 12 characters and malformed input', async () => {
    for (const body of [
      null,
      {},
      { email: 'bad', password },
      { email: 'a@b.com', password: 'short' },
      { email: 'a@b.com', password: 'study1234ab' },
      { email: 'a@b.com', password: '🔑'.repeat(11) },
      { email: 'a@b.com', password: 'é'.repeat(65) },
    ]) {
      await expect(auth.register(body, 'peer')).rejects.toMatchObject({
        kind: 'invalid',
      });
    }
  });

  it('accepts any 12 characters without composition rules', async () => {
    const passwords = [
      'abcdefghijkl',
      '123456789012',
      'études et ١٢',
      '🔑'.repeat(12),
    ];

    for (const [index, value] of passwords.entries()) {
      const email = `policy-${index}@example.com`;

      const grant = await auth.register({ email, password: value }, 'peer');

      expect(grant.user.email).toBe(email);
    }
  });

  it('continues to accept existing passwords without numbers at login', async () => {
    const credentials = {
      email: 'existing@example.com',
      password: 'a long existing passphrase',
    };
    const passwordHash = await new FakePasswords().hash(credentials.password);
    await repo.createUser(credentials.email, passwordHash);

    const grant = await auth.login(credentials, 'peer');

    expect(grant.user.email).toBe(credentials.email);
    expect(repo.users).toHaveLength(1);
  });

  it('prevents cross-user access to existing session resources', async () => {
    const firstAccount = await auth.register(
      { email: 'alice@example.com', password },
      'peer',
    );
    const secondAccount = await auth.register(
      { email: 'bob@example.com', password },
      'peer',
    );
    const principal = await auth.authenticate(firstAccount.token);

    expect(
      await auth.ownedSession(principal, firstAccount.sessionId),
    ).toMatchObject({
      id: firstAccount.sessionId,
    });
    await expect(
      auth.ownedSession(principal, secondAccount.sessionId),
    ).rejects.toMatchObject({ kind: 'not_found' });
  });

  describe('refresh credentials', () => {
    let grant: Awaited<ReturnType<AuthService['register']>>;

    beforeEach(async () => {
      grant = await auth.register({ email: 'a@example.com', password }, 'peer');
    });

    it('rotates both credentials and retires the previous access token', async () => {
      const refreshed = await auth.refresh(grant.refreshToken, '', 'peer');

      expect(refreshed.refreshToken).not.toBe(grant.refreshToken);
      expect(refreshed.sessionId).toBe(grant.sessionId);
      expect(refreshed.sessionExpiresAt).toEqual(grant.sessionExpiresAt);
      expect((await auth.authenticate(refreshed.token)).session.id).toBe(
        grant.sessionId,
      );
      await expect(auth.authenticate(grant.token)).rejects.toMatchObject({
        kind: 'unauthenticated',
      });
    });

    it('renews after the access token has expired', async () => {
      now = new Date(now.getTime() + 8 * 60 * 60 * 1000);

      const refreshed = await auth.refresh(grant.refreshToken, '', 'peer');

      expect(refreshed.expiresAt.getTime()).toBe(
        now.getTime() + TOKEN_SECONDS * 1000,
      );
    });

    it('does not let an access token renew a session that has a refresh credential', async () => {
      const renewal = auth.refresh('', grant.token, 'peer');

      await expect(renewal).rejects.toMatchObject({ kind: 'unauthenticated' });
      expect(repo.sessions[0].revokedAt).toBeNull();
    });

    it('revokes the session when a rotated refresh token is replayed', async () => {
      const refreshed = await auth.refresh(grant.refreshToken, '', 'thief');
      now = new Date(now.getTime() + (REFRESH_REUSE_GRACE_SECONDS + 1) * 1000);

      const replay = auth.refresh(grant.refreshToken, '', 'owner');

      await expect(replay).rejects.toMatchObject({ kind: 'unauthenticated' });
      expect(repo.sessions[0].revokedAt).not.toBeNull();
      await expect(
        auth.refresh(refreshed.refreshToken, '', 'thief'),
      ).rejects.toMatchObject({ kind: 'unauthenticated' });
      expect(events.events).toContainEqual({
        type: 'refresh_reuse',
        userId: grant.user.id,
        sessionId: grant.sessionId,
        peer: 'owner',
      });
    });

    it('tolerates a concurrent renewal inside the grace window', async () => {
      const winner = await auth.refresh(grant.refreshToken, '', 'peer');
      now = new Date(now.getTime() + 1000);

      const loser = auth.refresh(grant.refreshToken, '', 'peer');

      await expect(loser).rejects.toMatchObject({ kind: 'unauthenticated' });
      expect(repo.sessions[0].revokedAt).toBeNull();
      expect((await auth.authenticate(winner.token)).user.id).toBe(
        grant.user.id,
      );
    });

    it('rejects unknown, malformed and expired refresh tokens without revoking', async () => {
      for (const token of ['refresh-unknown', 'not-a-token']) {
        await expect(auth.refresh(token, '', 'peer')).rejects.toMatchObject({
          kind: 'unauthenticated',
        });
      }
      expect(repo.sessions[0].revokedAt).toBeNull();

      now = grant.sessionExpiresAt;

      await expect(
        auth.refresh(grant.refreshToken, '', 'peer'),
      ).rejects.toMatchObject({ kind: 'unauthenticated' });
    });

    it('gives a session created before refresh credentials its first one, once', async () => {
      Object.assign(repo.sessions[0], { refreshHash: null });

      const upgraded = await auth.refresh('', grant.token, 'peer');
      const replay = auth.refresh('', grant.token, 'peer');

      expect(repo.sessions[0].refreshHash).toBe(
        `hash:${upgraded.refreshToken}`,
      );
      await expect(replay).rejects.toMatchObject({ kind: 'unauthenticated' });
    });

    it('signs out with either credential and revokes immediately', async () => {
      const second = await auth.login(
        { email: 'a@example.com', password },
        'peer',
      );

      await auth.logout(grant.token, '');
      await auth.logout('expired-access-token', second.refreshToken);

      await expect(auth.authenticate(grant.token)).rejects.toMatchObject({
        kind: 'unauthenticated',
      });
      await expect(auth.authenticate(second.token)).rejects.toMatchObject({
        kind: 'unauthenticated',
      });
      await expect(
        auth.refresh(second.refreshToken, '', 'peer'),
      ).rejects.toMatchObject({ kind: 'unauthenticated' });
    });

    it('ignores sign-out without a credential', async () => {
      await auth.logout('', '');

      expect(repo.sessions.every((session) => !session.revokedAt)).toBe(true);
    });
  });

  it('rejects token codec failures and expired server sessions', async () => {
    const grant = await auth.register(
      { email: 'a@example.com', password },
      'peer',
    );

    await expect(auth.authenticate('invalid')).rejects.toMatchObject({
      kind: 'unauthenticated',
    });

    repo.sessions[0].expiresAt = new Date(now.getTime() - 1);

    await expect(auth.authenticate(grant.token)).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
  });

  it('rejects mismatched session owners', async () => {
    await auth.register({ email: 'a@example.com', password }, 'peer');
    const session = repo.sessions[0];
    const token = await tokens.issue(randomUUID(), session.id, session.tokenId);

    await expect(auth.authenticate(token)).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
  });

  describe('registration probing', () => {
    const taken = { email: 'taken@example.com', password };

    beforeEach(async () => {
      await auth.register(taken, 'owner');
    });

    it('bounds how many existing emails one client can probe', async () => {
      for (let i = 0; i < 10; i++) {
        await expect(auth.register(taken, 'prober')).rejects.toMatchObject({
          kind: 'conflict',
        });
      }

      const blocked = auth.register(
        { email: 'new@example.com', password },
        'prober',
      );
      const elsewhere = await auth.register(
        { email: 'new@example.com', password },
        'someone-else',
      );

      await expect(blocked).rejects.toMatchObject({ kind: 'rate_limited' });
      expect(elsewhere.user.email).toBe('new@example.com');
    });

    it('does not spend the budget on successful registrations', async () => {
      for (let i = 0; i < 15; i++) {
        await auth.register(
          { email: `classmate-${i}@example.com`, password },
          'school-lab',
        );
      }

      const conflict = auth.register(taken, 'school-lab');

      await expect(conflict).rejects.toMatchObject({ kind: 'conflict' });
    });

    it('records conflicts without the password', async () => {
      await expect(auth.register(taken, 'prober')).rejects.toMatchObject({
        kind: 'conflict',
      });

      expect(events.events).toContainEqual({
        type: 'registration_conflict',
        email: taken.email,
        peer: 'prober',
      });
      expect(JSON.stringify(events.events)).not.toContain(password);
    });
  });

  describe('sign-in limits', () => {
    const credentials = { email: 'victim@example.com', password };
    const wrong = { ...credentials, password: 'wrong password' };

    async function fail(peer: string, times: number) {
      for (let i = 0; i < times; i++) {
        await expect(auth.login(wrong, peer)).rejects.toMatchObject({
          kind: 'unauthenticated',
        });
      }
    }

    beforeEach(async () => {
      await auth.register(credentials, 'signup-peer');
    });

    it('locks only the client that keeps failing for an account', async () => {
      await fail('attacker', 10);

      const lockedOut = auth.login(credentials, 'attacker');
      const victim = await auth.login(credentials, 'victim');

      await expect(lockedOut).rejects.toMatchObject({ kind: 'rate_limited' });
      expect(victim.user.email).toBe(credentials.email);
    });

    it('does not count successful sign-ins toward the lockout', async () => {
      for (let i = 0; i < 15; i++) {
        await auth.login(credentials, 'victim');
      }

      const grant = await auth.login(credentials, 'victim');

      expect(grant.user.email).toBe(credentials.email);
    });

    it('resets the failures of a client after it signs in', async () => {
      await fail('victim', 9);
      await auth.login(credentials, 'victim');

      await fail('victim', 9);
      const grant = await auth.login(credentials, 'victim');

      expect(grant.user.email).toBe(credentials.email);
    });

    it('keeps a per-account backstop against distributed guessing', async () => {
      for (let i = 0; i < 10; i++) {
        await fail(`botnet-${i}`, 10);
      }

      const fresh = auth.login(wrong, 'fresh-client');

      await expect(fresh).rejects.toMatchObject({ kind: 'rate_limited' });
      expect(events.events.at(-1)).toEqual({
        type: 'rate_limited',
        scope: 'account',
        peer: 'fresh-client',
        email: credentials.email,
      });
    });

    it('throttles each client independently', async () => {
      const busy = 'shared-proxy';
      for (let i = 0; i < 300; i++) {
        await auth.login(credentials, busy);
      }

      const throttled = auth.login(credentials, busy);
      const other = await auth.login(credentials, 'other-client');

      await expect(throttled).rejects.toMatchObject({ kind: 'rate_limited' });
      expect(other.user.email).toBe(credentials.email);
    });
  });
});
