import type { StreamConnection } from '../stream.js';

export interface StreamAuthorization {
  execution(
    id: string,
  ): Promise<{ id: string; userId: string; sessionId: string }>;
  liveSession(connection: StreamConnection): Promise<boolean>;
  ownsExecution(connection: StreamConnection): Promise<boolean>;
}
