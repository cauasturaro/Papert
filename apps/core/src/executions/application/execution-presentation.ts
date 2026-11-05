import type { ExecutionRecord } from '../domain/execution.js';

/** What learners and the stream see of an execution; the private input stays out. */
export function executionView(job: ExecutionRecord) {
  const input = job.input as { kind?: string; prompt?: string };

  return {
    id: job.id,
    workspaceId: job.workspaceId,
    kind: input.kind ?? 'chat',
    prompt: input.prompt ?? null,
    status: job.status,
    text: job.text,
    grounding: job.grounding ?? null,
    sequence: job.sequence,
    attempts: job.attempts,
    charged: job.charged,
    reserved: job.reserved,
    createdAt: job.createdAt,
    firstEventAt: job.firstEventAt,
    finishedAt: job.finishedAt,
    deadline: job.deadline,
  };
}
