import type { ExecutionRecord } from '../domain/execution.js';

/** What learners and the stream see of an execution; the private input stays out. */
export function executionView(job: ExecutionRecord) {
  const input = job.input as {
    kind?: string;
    prompt?: string;
    conversationId?: string;
    memory?: unknown[];
  };

  return {
    id: job.id,
    workspaceId: job.workspaceId,
    kind: input.kind ?? 'chat',
    prompt: input.prompt ?? null,
    conversationId: input.conversationId ?? null,
    // How many durable notes Core sent with this request; their text stays private here.
    memoryUsed: Array.isArray(input.memory) ? input.memory.length : 0,
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
