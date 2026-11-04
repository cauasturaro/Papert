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
