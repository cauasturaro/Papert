export interface SignInLimiter {
  // Throttles every sign-in and registration request from one client.
  admit(peer: string): Promise<void>;

  // Counts a sign-in as failed until `succeeded` gives the attempt back.
  reserve(email: string, peer: string): Promise<void>;
  succeeded(email: string, peer: string): Promise<void>;

  // Counts a registration as an existing-email conflict until `registered` gives it back.
  reserveRegistration(peer: string): Promise<void>;
  registered(peer: string): Promise<void>;
}
