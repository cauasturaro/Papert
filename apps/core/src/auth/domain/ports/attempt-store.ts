export interface AttemptStore {
  consumeAttempt(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean>;
}
