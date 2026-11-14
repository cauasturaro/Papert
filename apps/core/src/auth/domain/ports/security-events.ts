export type RateLimitScope =
  'client' | 'account_client' | 'account' | 'registration_conflict';

// Events never carry passwords, tokens or cookies; adapters pseudonymize emails.
export type SecurityEvent =
  | {
      type: 'sign_in_failed';
      email: string;
      peer: string;
      knownAccount: boolean;
    }
  | { type: 'registration_conflict'; email: string; peer: string }
  | {
      type: 'rate_limited';
      scope: RateLimitScope;
      peer: string;
      email?: string;
    }
  | { type: 'refresh_reuse'; userId: string; sessionId: string; peer: string }
  | {
      type: 'origin_rejected';
      peer: string;
      method: string;
      path: string;
      origin: string | null;
    };

export interface SecurityEvents {
  record(event: SecurityEvent): void;
}
