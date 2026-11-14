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
