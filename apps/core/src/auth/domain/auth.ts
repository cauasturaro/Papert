import { DomainError } from '../../common/domain/domain-error.js';

export class AuthError extends DomainError {}

export type User = {
  id: string;
  email: string;
};

// Only sign-in reads the hash; principals and responses carry a plain User.
export type Account = User & { passwordHash: string };

export type Session = {
  id: string;
  userId: string;
  tokenId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type RefreshState = {
  refreshHash: string | null;
  previousRefreshHash: string | null;
  refreshRotatedAt: Date | null;
};

export type Principal = {
  user: User;
  session: Session;
};
