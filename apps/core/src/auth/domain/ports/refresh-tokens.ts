// Opaque refresh credentials; only their hashes are persisted.
export interface RefreshTokens {
  generate(): { token: string; hash: string };

  // Returns null for values that cannot be a refresh token.
  hash(token: string): string | null;
}
