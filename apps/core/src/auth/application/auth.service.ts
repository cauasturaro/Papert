import { randomUUID } from 'node:crypto';
import { AuthError } from '../domain/auth.js';
import type {
  AuthRepository,
  Passwords,
  Principal,
  Tokens,
  SignInLimiter,
  User,
} from '../domain/auth.js';
import { parseCredentials } from '../domain/credentials.js';

export const TOKEN_SECONDS = 15 * 60;
export const SESSION_SECONDS = 7 * 24 * 60 * 60;

const unauthorized = () =>
  new AuthError(401, 'Your session has expired. Please sign in again.');

export class AuthService {
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly repo: AuthRepository,
    private readonly passwords: Passwords,
    private readonly tokens: Tokens,
    private readonly limiter: SignInLimiter,
  ) {
    // Unknown accounts still perform password verification to avoid a cheap timing signal.
    this.dummyHash = passwords.hash(randomUUID());
  }

  async register(body: unknown, peer: string) {
    const { email, password } = parseCredentials(body);
    await this.limiter.check(email, peer);

    if (
      Array.from(password).length < 8 ||
      !/\p{L}/u.test(password) ||
      !/\p{Nd}/u.test(password)
    ) {
      throw new AuthError(
        400,
        'Use at least 8 characters, including at least one letter and one number (maximum 128 bytes).',
      );
    }

    const passwordHash = await this.passwords.hash(password);
    const user = await this.repo.createUser(email, passwordHash);
    if (!user) {
      throw new AuthError(
        409,
        'Unable to create an account with these details. Try signing in.',
      );
    }

    return this.startSession(user);
  }

  async login(body: unknown, peer: string) {
    const { email, password } = parseCredentials(body);
    await this.limiter.check(email, peer);

    const user = await this.repo.findUser(email);
    const valid = await this.passwords.verify(
      user?.passwordHash ?? (await this.dummyHash),
      password,
    );
    if (!user || !valid) {
      throw new AuthError(401, 'Email or password is incorrect.');
    }

    return this.startSession(user);
  }

  async authenticate(token: string): Promise<Principal> {
    let claims;

    try {
      claims = await this.tokens.read(token);
    } catch {
      throw unauthorized();
    }

    // The persisted session remains authoritative after logout or token renewal.
    const session = await this.repo.findSession(claims.sessionId);
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      session.userId !== claims.userId ||
      session.tokenId !== claims.tokenId
    ) {
      throw unauthorized();
    }

    return { user: session.user, session };
  }

  async refresh(principal: Principal) {
    const tokenId = randomUUID();

    // Compare-and-swap prevents renewal from reusing an already rotated token.
    const rotated = await this.repo.rotateSession(
      principal.session.id,
      principal.session.tokenId,
      tokenId,
    );
    if (!rotated) {
      throw unauthorized();
    }

    return this.grant({
      user: principal.user,
      session: { ...principal.session, tokenId },
    });
  }

  async ownedSession(principal: Principal, id: string) {
    const session = await this.repo.findSession(id);
    if (!session || session.userId !== principal.user.id) {
      throw new AuthError(404, 'Session not found.');
    }

    return {
      id: session.id,
      expiresAt: session.expiresAt,
      revoked: session.revokedAt !== null,
    };
  }

  async logout(principal: Principal) {
    await this.repo.revokeSession(principal.session.id, principal.user.id);
  }

  private async startSession(user: User) {
    const session = await this.repo.createSession(
      user.id,
      randomUUID(),
      new Date(Date.now() + SESSION_SECONDS * 1000),
    );

    return this.grant({ user, session });
  }

  private async grant({ user, session }: Principal) {
    const expiresAt = new Date(
      Math.min(Date.now() + TOKEN_SECONDS * 1000, session.expiresAt.getTime()),
    );

    return {
      token: await this.tokens.issue(
        user.id,
        session.id,
        session.tokenId,
        expiresAt,
      ),
      expiresAt,
      user: { id: user.id, email: user.email },
      sessionId: session.id,
    };
  }
}
