import { createHmac } from 'node:crypto';
import type {
  SecurityEvent,
  SecurityEvents,
} from '../domain/ports/security-events.js';

export const SECURITY_EVENTS = Symbol('SECURITY_EVENTS');

const MAX_FIELD_LENGTH = 200;

export type LogWriter = (line: string) => void;

// Derived from the active token key so email hashes correlate across instances without another secret.
export function emailHashKey(activeKid: string, encodedKeys: string) {
  const keys = JSON.parse(encodedKeys) as Record<string, string>;
  const key = keys[activeKid];
  if (typeof key !== 'string') {
    throw new Error('AUTH_JWE_ACTIVE_KID is missing from AUTH_JWE_KEYS.');
  }

  return createHmac('sha256', Buffer.from(key, 'hex'))
    .update('papert-security-log-email')
    .digest();
}

export class StructuredSecurityLog implements SecurityEvents {
  private key: Buffer | undefined;

  constructor(
    private readonly loadKey: () => Buffer,
    private readonly write: LogWriter = (line) => console.warn(line),
    private readonly now: () => Date = () => new Date(),
  ) {}

  record(event: SecurityEvent) {
    const { type, ...fields } = event;
    const entry: Record<string, unknown> = {
      securityEvent: `auth.${type}`,
      at: this.now().toISOString(),
    };

    for (const [name, value] of Object.entries(fields)) {
      if (name === 'email') {
        entry.emailHash = this.hashEmail(String(value));
      } else if (typeof value === 'string') {
        entry[name] = value.slice(0, MAX_FIELD_LENGTH);
      } else {
        entry[name] = value;
      }
    }

    this.write(JSON.stringify(entry));
  }

  private hashEmail(email: string) {
    this.key ??= this.loadKey();

    return createHmac('sha256', this.key)
      .update(email)
      .digest('hex')
      .slice(0, 32);
  }
}
