import type { User, Session } from '../auth.js';

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
