export interface SignInLimiter {
  check(email: string, peer: string): Promise<void>;
}
