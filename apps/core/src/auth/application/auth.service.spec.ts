import { randomUUID } from 'node:crypto';
import { EncryptJWT } from 'jose';
import { AuthService } from './auth.service.js';
import { SignInRateLimiter } from './sign-in-rate-limiter.js';
import { ArgonPasswords, JweTokens } from '../infrastructure/crypto.js';
import type {
  AttemptStore,
  AuthRepository,
  User,
  Session,
} from '../domain/auth.js';

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
  let tokens: JweTokens;

  const password = 'study123';

  beforeEach(() => {
    repo = new MemoryRepository();
    tokens = new JweTokens('test', JSON.stringify({ test: 'ab'.repeat(32) }));
    auth = new AuthService(
      repo,
      new ArgonPasswords(),
      tokens,
      new SignInRateLimiter(repo),
    );
  });

  it('registers normalized identities, salts passwords and never returns hashes', async () => {
    const firstAccount = await auth.register(
      { email: 'Alice@EXAMPLE.com', password },
      'peer',
    );
    await auth.register({ email: 'bob@example.com', password }, 'peer');

    expect(firstAccount.user.email).toBe('alice@example.com');
    expect(JSON.stringify(firstAccount)).not.toContain('password');
    expect(repo.users[0].passwordHash).toMatch(/^\$argon2id\$/);
    expect(repo.users[0].passwordHash).not.toBe(repo.users[1].passwordHash);
    expect((await auth.authenticate(firstAccount.token)).user.id).toBe(
      firstAccount.user.id,
    );
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
      status: 409,
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
        status: 401,
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
        status: 400,
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
    const passwordHash = await new ArgonPasswords().hash(credentials.password);
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
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rotates tokens on renewal, rejects replay and revokes immediately on logout', async () => {
    const firstAccount = await auth.register(
      { email: 'a@example.com', password },
      'peer',
    );
    const principal = await auth.authenticate(firstAccount.token);
    const refreshed = await auth.refresh(principal);

    await expect(auth.authenticate(firstAccount.token)).rejects.toMatchObject({
      status: 401,
    });
    await expect(auth.refresh(principal)).rejects.toMatchObject({
      status: 401,
    });

    await auth.logout(await auth.authenticate(refreshed.token));
    await expect(auth.authenticate(refreshed.token)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('rejects expired tokens, altered ciphertext and expired server sessions', async () => {
    const firstAccount = await auth.register(
      { email: 'a@example.com', password },
      'peer',
    );

    const parts = firstAccount.token.split('.');
    parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
    await expect(auth.authenticate(parts.join('.'))).rejects.toMatchObject({
      status: 401,
    });

    const expired = await tokens.issue(
      firstAccount.user.id,
      firstAccount.sessionId,
      repo.sessions[0].tokenId,
      new Date(Date.now() - 1000),
    );
    await expect(auth.authenticate(expired)).rejects.toMatchObject({
      status: 401,
    });

    repo.sessions[0].expiresAt = new Date(Date.now() - 1);
    await expect(auth.authenticate(firstAccount.token)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('rejects wrong issuer, audience, missing identity and mismatched session owner', async () => {
    const grant = await auth.register(
      { email: 'a@example.com', password },
      'peer',
    );
    const session = repo.sessions[0];

    for (const [issuer, audience, subject] of [
      ['other-service', 'papert-web', grant.user.id],
      ['papert-core', 'other-client', grant.user.id],
      ['papert-core', 'papert-web', ''],
    ]) {
      const token = await new EncryptJWT({ sid: session.id })
        .setProtectedHeader({
          alg: 'dir',
          enc: 'A256GCM',
          kid: 'test',
          typ: 'JWT',
        })
        .setSubject(subject)
        .setJti(session.tokenId)
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime('15m')
        .encrypt(Buffer.from('ab'.repeat(32), 'hex'));
      await expect(auth.authenticate(token)).rejects.toMatchObject({
        status: 401,
      });
    }

    const token = await tokens.issue(
      randomUUID(),
      session.id,
      session.tokenId,
      new Date(Date.now() + 60_000),
    );
    await expect(auth.authenticate(token)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('limits attempts across peers for one account', async () => {
    for (let i = 0; i < 10; i++) {
      await expect(
        auth.login({ email: 'a@example.com', password: 'bad' }, `peer-${i}`),
      ).rejects.toMatchObject({ status: 401 });
    }

    await expect(
      auth.login({ email: 'a@example.com', password: 'bad' }, 'new-peer'),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('accepts retained keys during rotation and rejects retired or unknown keys', async () => {
    const firstAccount = await auth.register(
      { email: 'a@example.com', password },
      'peer',
    );

    const rotated = new JweTokens(
      'new',
      JSON.stringify({ test: 'ab'.repeat(32), new: 'cd'.repeat(32) }),
    );

    expect((await rotated.read(firstAccount.token)).userId).toBe(
      firstAccount.user.id,
    );
    await expect(
      new JweTokens('new', JSON.stringify({ new: 'cd'.repeat(32) })).read(
        firstAccount.token,
      ),
    ).rejects.toThrow();

    expect(() => new JweTokens('bad', '{}')).toThrow();
    expect(() => new JweTokens('bad', 'secret material, invalid JSON')).toThrow(
      'AUTH_JWE_KEYS must be a valid JSON key map.',
    );
  });
});
