import type { StreamGrant } from '../stream.js';

export interface StreamTickets {
  generate(): string;
  replace(
    ticket: string,
    grant: StreamGrant,
    lifetimeMs: number,
  ): Promise<void>;
  consume(ticket: string): Promise<StreamGrant | null>;
}
