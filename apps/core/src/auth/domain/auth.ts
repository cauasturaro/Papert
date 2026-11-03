import { DomainError } from '../../common/domain/domain-error.js';

export class AuthError extends DomainError {}

export type User = {
  id: string;
  email: string;
  passwordHash: string;
};

export type Session = {
  id: string;
  userId: string;
  tokenId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type Principal = {
  user: User;
  session: Session;
};

export interface AuthRepository {
  createUser(email: string, passwordHash: string): Promise<User | null>;
  findUser(email: string): Promise<User | null>;

  createSession(
    userId: string,
    tokenId: string,
    expiresAt: Date,
  ): Promise<Session>;

  findSession(id: string): Promise<(Session & { user: User }) | null>;

  rotateSession(
    id: string,
    oldTokenId: string,
    tokenId: string,
  ): Promise<boolean>;
  revokeSession(id: string, userId: string): Promise<void>;
}

export interface AttemptStore {
  consumeAttempt(key: string, limit: number): Promise<boolean>;
}

export interface SignInLimiter {
  check(email: string, peer: string): Promise<void>;
}

export interface Passwords {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface Tokens {
  issue(
    userId: string,
    sessionId: string,
    tokenId: string,
    expiresAt: Date,
  ): Promise<string>;

  read(
    token: string,
  ): Promise<{ userId: string; sessionId: string; tokenId: string }>;
}
