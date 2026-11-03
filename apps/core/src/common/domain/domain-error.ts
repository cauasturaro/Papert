// Semantic failure categories; each adapter decides how a kind is transported.
export type DomainErrorKind =
  | 'invalid'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited';

export class DomainError extends Error {
  constructor(
    public readonly kind: DomainErrorKind,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
