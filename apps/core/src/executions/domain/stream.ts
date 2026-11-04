import type { ExecutionRecord } from './execution.js';

export type StreamPrincipal = {
  user: { id: string };
  session: { id: string; tokenId: string };
};
export type StreamConnection = {
  connectionId: string;
  executionId: string;
  userId: string;
  authSessionId: string;
  tokenId: string;
  sessionId: string;
  expires: number;
};
export type StreamGrant = {
  executionId: string;
  authSessionId: string;
  tokenId: string;
};

export interface StreamTickets {
  generate(): string;
  replace(
    ticket: string,
    grant: StreamGrant,
    lifetimeMs: number,
  ): Promise<void>;
  consume(ticket: string): Promise<StreamGrant | null>;
}

export interface StreamAuthorization {
  execution(
    id: string,
  ): Promise<{ id: string; userId: string; sessionId: string }>;
  liveSession(connection: StreamConnection): Promise<boolean>;
  ownsExecution(connection: StreamConnection): Promise<boolean>;
}

export interface StreamConnections {
  put(connection: StreamConnection): Promise<void>;
  get(connectionId: string): Promise<StreamConnection | null>;
  remove(connection: StreamConnection): Promise<void>;
  forExecution(id: string): AsyncIterable<StreamConnection>;
}

export class StreamConnectionClosed extends Error {}

export interface StreamDelivery {
  enabled(): boolean;
  open(): {
    send(connectionId: string, snapshot: unknown): Promise<void>;
    close(): void;
  };
}

export interface StreamExecutions {
  owned(userId: string, id: string): Promise<ExecutionRecord>;
  snapshot(job: ExecutionRecord): unknown;
}

export type StreamSettings = {
  enabled: boolean;
};
