import type { ExecutionRecord } from '../execution.js';

export interface StreamExecutions {
  owned(userId: string, id: string): Promise<ExecutionRecord>;
  snapshot(job: ExecutionRecord): unknown;
}
