import type { Clock, IdGenerator } from '../../common/domain/runtime.js';
import { AuthError } from '../domain/auth.js';
import type {
  AuthRepository,
  RefreshableSession,
} from '../domain/ports/auth-repository.js';
import type { RefreshTokens } from '../domain/ports/refresh-tokens.js';
import type { Passwords } from '../domain/ports/passwords.js';
import type { Principal, User } from '../domain/auth.js';
import type { Tokens } from '../domain/ports/tokens.js';
import type { SignInLimiter } from '../domain/ports/sign-in-limiter.js';
import type { SecurityEvents } from '../domain/ports/security-events.js';
import { parseCredentials } from './contracts/credentials.contract.js';

export const TOKEN_SECONDS = 15 * 60;
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const REFRESH_REUSE_GRACE_SECONDS = 30;

// Length-only policy: composition rules push users toward predictable patterns.
const MIN_PASSWORD_CHARACTERS = 12;

const unauthorized = () =>
  new AuthError(
    'unauthenticated',
    'Your session has expired. Please sign in again.',
  );

export class AuthService {
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly repo: AuthRepository,
    private readonly passwords: Passwords,
    private readonly tokens: Tokens,
    private readonly refreshTokens: RefreshTokens,
    private readonly limiter: SignInLimiter,
    private readonly events: SecurityEvents,
    private readonly now: Clock,
    private readonly generateId: IdGenerator,
  ) {
    // Unknown accounts still perform password verification to avoid a cheap timing signal.
    this.dummyHash = passwords.hash(this.generateId());
  }

  async register(body: unknown, peer: string) {
    const { email, password } = parseCredentials(body);
    await this.limiter.admit(peer);

    if (Array.from(password).length < MIN_PASSWORD_CHARACTERS) {
      throw new AuthError(
        'invalid',
        `Use at least ${MIN_PASSWORD_CHARACTERS} characters. A few unrelated words make a strong, memorable password.`,
      );
    }

    await this.limiter.reserveRegistration(peer);

    const passwordHash = await this.passwords.hash(password);
    const user = await this.repo.createUser(email, passwordHash);
    if (!user) {
      this.events.record({ type: 'registration_conflict', email, peer });

      throw new AuthError(
        'conflict',
        'Unable to create an account with these details. Try signing in.',
      );
    }

    await this.limiter.registered(peer);

    return this.startSession(user);
  }

  async login(body: unknown, peer: string) {
    const { email, password } = parseCredentials(body);
    await this.limiter.admit(peer);
    await this.limiter.reserve(email, peer);

    const user = await this.repo.findUser(email);
    const valid = await this.passwords.verify(
      user?.passwordHash ?? (await this.dummyHash),
      password,
    );
    if (!user || !valid) {
      this.events.record({
        type: 'sign_in_failed',
        email,
        peer,
        knownAccount: user !== null,
      });

      throw new AuthError('unauthenticated', 'Email or password is incorrect.');
    }

    // Successful sign-ins do not count toward the lockout.
    await this.limiter.succeeded(email, peer);

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
      session.expiresAt.getTime() <= this.now().getTime() ||
      session.userId !== claims.userId ||
      session.tokenId !== claims.tokenId
    ) {
      throw unauthorized();
    }

    return { user: session.user, session };
  }

  // Refresh credentials rotate on every use; replaying an old one ends the session.
  async refresh(refreshToken: string, accessToken: string, peer: string) {
    if (refreshToken) {
      return this.rotateRefresh(refreshToken, peer);
    }

    return this.upgradeSession(accessToken);
  }

  async ownedSession(principal: Principal, id: string) {
    const session = await this.repo.findSession(id);
    if (!session || session.userId !== principal.user.id) {
      throw new AuthError('not_found', 'Session not found.');
    }

    return {
      id: session.id,
      expiresAt: session.expiresAt,
      revoked: session.revokedAt !== null,
    };
  }

  // Either credential identifies the session, so an expired access token can still sign out.
  async logout(accessToken: string, refreshToken: string) {
    const session = await this.sessionToEnd(accessToken, refreshToken);
    if (!session) {
      return;
    }

    await this.repo.revokeSession(session.id, session.userId);
  }

  private async rotateRefresh(refreshToken: string, peer: string) {
    const hash = this.refreshTokens.hash(refreshToken);
    if (!hash) {
      throw unauthorized();
    }

    const now = this.now();
    const session = await this.repo.findSessionByRefresh(hash);
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= now.getTime()
    ) {
      throw unauthorized();
    }

    if (session.refreshHash !== hash) {
      await this.rejectPreviousGeneration(session, now, peer);
    }

    const tokenId = this.generateId();
    const next = this.refreshTokens.generate();

    const rotated = await this.repo.rotateRefresh(session.id, hash, {
      tokenId,
      refreshHash: next.hash,
      rotatedAt: now,
    });
    if (!rotated) {
      throw unauthorized();
    }

    return this.grant(
      { user: session.user, session: { ...session, tokenId } },
      next.token,
    );
  }

  private async rejectPreviousGeneration(
    session: RefreshableSession,
    now: Date,
    peer: string,
  ): Promise<never> {
    const rotatedAt = session.refreshRotatedAt?.getTime() ?? 0;

    // Two tabs renewing together present the same token; only later replays signal theft.
    if (now.getTime() - rotatedAt > REFRESH_REUSE_GRACE_SECONDS * 1000) {
      await this.repo.revokeSession(session.id, session.userId);

      this.events.record({
        type: 'refresh_reuse',
        userId: session.userId,
        sessionId: session.id,
        peer,
      });
    }

    throw unauthorized();
  }

  // Sessions created before refresh credentials existed renew once with their access token.
  private async upgradeSession(accessToken: string) {
    const principal = await this.authenticate(accessToken);
    const tokenId = this.generateId();
    const next = this.refreshTokens.generate();

    const upgraded = await this.repo.upgradeSession(
      principal.session.id,
      principal.session.tokenId,
      { tokenId, refreshHash: next.hash, rotatedAt: this.now() },
    );
    if (!upgraded) {
      throw unauthorized();
    }

    return this.grant(
      { user: principal.user, session: { ...principal.session, tokenId } },
      next.token,
    );
  }

  private async sessionToEnd(accessToken: string, refreshToken: string) {
    try {
      const principal = await this.authenticate(accessToken);

      return principal.session;
    } catch (error) {
      if (!(error instanceof AuthError)) {
        throw error;
      }
    }

    const hash = this.refreshTokens.hash(refreshToken);
    if (!hash) {
      return null;
    }

    return this.repo.findSessionByRefresh(hash);
  }

  private async startSession(user: User) {
    const tokenId = this.generateId();
    const expiresAt = new Date(this.now().getTime() + SESSION_SECONDS * 1000);

    const refresh = this.refreshTokens.generate();

    const session = await this.repo.createSession(
      user.id,
      tokenId,
      expiresAt,
      refresh.hash,
    );

    return this.grant({ user, session }, refresh.token);
  }

  private async grant({ user, session }: Principal, refreshToken: string) {
    const expiresAt = new Date(
      Math.min(
        this.now().getTime() + TOKEN_SECONDS * 1000,
        session.expiresAt.getTime(),
      ),
    );

    return {
      token: await this.tokens.issue(
        user.id,
        session.id,
        session.tokenId,
        expiresAt,
      ),
      expiresAt,
      refreshToken,
      // The refresh credential lives as long as the session; there is no sliding extension.
      sessionExpiresAt: session.expiresAt,
      user: { id: user.id, email: user.email },
      sessionId: session.id,
    };
  }
}
