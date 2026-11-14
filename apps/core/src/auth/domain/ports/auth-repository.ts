import type { Account, RefreshState, Session, User } from '../auth.js';

export type RefreshableSession = Session & RefreshState & { user: User };

export interface AuthRepository {
  createUser(email: string, passwordHash: string): Promise<User | null>;
  findUser(email: string): Promise<Account | null>;

  createSession(
    userId: string,
    tokenId: string,
    expiresAt: Date,
    refreshHash: string,
  ): Promise<Session>;

  findSession(id: string): Promise<(Session & { user: User }) | null>;

  // Matches the current or the previous refresh generation.
  findSessionByRefresh(hash: string): Promise<RefreshableSession | null>;

  // Compare-and-swap on the current refresh hash.
  rotateRefresh(
    id: string,
    currentHash: string,
    next: { tokenId: string; refreshHash: string; rotatedAt: Date },
  ): Promise<boolean>;

  // Gives a session created before refresh credentials existed its first one.
  upgradeSession(
    id: string,
    oldTokenId: string,
    next: { tokenId: string; refreshHash: string; rotatedAt: Date },
  ): Promise<boolean>;

  revokeSession(id: string, userId: string): Promise<void>;
}
