import { randomUUID } from 'node:crypto';
import { SESSION_SECONDS, TOKEN_SECONDS, AuthService } from './auth.service.js';
import { SignInRateLimiter } from './sign-in-rate-limiter.js';
import type {
  Passwords,
  Tokens,
  AttemptStore,
  AuthRepository,
  User,
  Session,
} from '../domain/auth.js';

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

class MemoryRepository implements AuthRepository, AttemptStore {
  users: User[] = [];
  sessions: Session[] = [];
  attempts = new Map<string, number>();

  async createUser(email: string, passwordHash: string) {
    if (this.users.some((user) => user.email === email)) {
      return null;
    }

    const user = { id: randomUUID(), email, passwordHash };
    this.users.push(user);

    return user;
  }

  async findUser(email: string) {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async createSession(userId: string, tokenId: string, expiresAt: Date) {
    const session = {
      id: randomUUID(),
      userId,
      tokenId,
      expiresAt,
      revokedAt: null,
    };

    this.sessions.push(session);

    return session;
  }

  async findSession(id: string) {
    const session = this.sessions.find((value) => value.id === id);

    return session
      ? {
          ...session,
          user: this.users.find((user) => user.id === session.userId)!,
        }
      : null;
  }

  async rotateSession(id: string, oldTokenId: string, tokenId: string) {
    const session = this.sessions.find(
      (value) =>
        value.id === id && value.tokenId === oldTokenId && !value.revokedAt,
    );
    if (!session) {
      return false;
    }

    session.tokenId = tokenId;

    return true;
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
}

describe('Authentication policy', () => {
  let repo: MemoryRepository;
  let auth: AuthService;
  let tokens: FakeTokens;
  let now: Date;

  const password = 'study123';

  beforeEach(() => {
    let generated = 0;
    now = new Date('2026-11-03T23:59:59Z');

    repo = new MemoryRepository();
    tokens = new FakeTokens();
    auth = new AuthService(
      repo,
      new FakePasswords(),
      tokens,
      new SignInRateLimiter(repo),
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
    const principal = await auth.authenticate(registered.token);
    const refreshed = await auth.refresh(principal);

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
  });

  it('rejects short passwords, missing letters or numbers, and malformed input', async () => {
    for (const body of [
      null,
      {},
      { email: 'bad', password },
      { email: 'a@b.com', password: 'short' },
      { email: 'a@b.com', password: 'short12' },
      { email: 'a@b.com', password: 'abcdefgh' },
      { email: 'a@b.com', password: '12345678' },
      { email: 'a@b.com', password: 'é'.repeat(65) },
    ]) {
      await expect(auth.register(body, 'peer')).rejects.toMatchObject({
        kind: 'invalid',
      });
    }
  });

  it('accepts Unicode letters and numbers without requiring uppercase or symbols', async () => {
    const credentials = { email: 'unicode@example.com', password: 'études١٢' };

    const grant = await auth.register(credentials, 'peer');

    expect(grant.user.email).toBe(credentials.email);
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

  it('rotates tokens on renewal, rejects replay and revokes immediately on logout', async () => {
    const firstAccount = await auth.register(
      { email: 'a@example.com', password },
      'peer',
    );
    const principal = await auth.authenticate(firstAccount.token);
    const refreshed = await auth.refresh(principal);

    await expect(auth.authenticate(firstAccount.token)).rejects.toMatchObject({
      kind: 'unauthenticated',
    });
    await expect(auth.refresh(principal)).rejects.toMatchObject({
      kind: 'unauthenticated',
    });

    await auth.logout(await auth.authenticate(refreshed.token));
    await expect(auth.authenticate(refreshed.token)).rejects.toMatchObject({
      kind: 'unauthenticated',
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

  it('limits attempts across peers for one account', async () => {
    for (let i = 0; i < 10; i++) {
      await expect(
        auth.login({ email: 'a@example.com', password: 'bad' }, `peer-${i}`),
      ).rejects.toMatchObject({ kind: 'unauthenticated' });
    }

    await expect(
      auth.login({ email: 'a@example.com', password: 'bad' }, 'new-peer'),
    ).rejects.toMatchObject({ kind: 'rate_limited' });
  });
});
