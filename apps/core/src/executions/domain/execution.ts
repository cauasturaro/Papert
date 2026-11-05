import { DomainError } from '../../common/domain/domain-error.js';

export class ExecutionError extends DomainError {}

export type TerminalStatus = 'completed' | 'failed' | 'cancelled' | 'timed_out';
export const terminal = (status: string) =>
  !['queued', 'running'].includes(status);

export type ExecutionRequest = {
  requestKey: string;
  revision: number;
  kind: 'chat' | 'analysis';
  prompt?: string;
  mode?: 'doubt' | 'teaching' | 'solution' | 'review';
  effort?: 'low' | 'medium' | 'high';
  activeFile?: string;
  selection?: { start: number; end: number };
  sourceIds?: string[];
  conversationId?: string;
};

export type WorkerEvent = {
  version: 1;
  executionId: string;
  lease: string;
  index: number;
  status: 'running' | 'completed' | 'failed';
  text: string;
  tokens: number;
  evaluation?: unknown;
  grounding?: unknown;
  roadmap?: unknown;
  recommendation?: unknown;
  memory?: unknown;
};

export type ExecutionRecord = {
  id: string;
  workspaceId: string;
  input: unknown;
  status: string;
  text: string;
  grounding: unknown;
  sequence: number;
  attempts: number;
  charged: number;
  reserved: number;
  createdAt: Date;
  firstEventAt: Date | null;
  finishedAt: Date | null;
  deadline: Date;
  publishedAt: Date | null;
};
