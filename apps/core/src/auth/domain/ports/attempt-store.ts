export interface AttemptStore {
  consumeAttempt(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean>;

  // Gives back one attempt consumed in the current window.
  releaseAttempt(key: string): Promise<void>;
  clearAttempts(key: string): Promise<void>;
}
