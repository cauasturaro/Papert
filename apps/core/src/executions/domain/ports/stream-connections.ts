import type { StreamConnection } from '../stream.js';

export interface StreamConnections {
  put(connection: StreamConnection): Promise<void>;
  get(connectionId: string): Promise<StreamConnection | null>;
  remove(connection: StreamConnection): Promise<void>;
  forExecution(id: string): AsyncIterable<StreamConnection>;
}
