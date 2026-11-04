import {
  assessEvaluation,
  ExecutionError,
  ATTEMPT_BUDGET,
  GENERATION_ATTEMPT_BUDGET,
  TUTOR_ATTEMPT_BUDGET,
  MAX_ATTEMPTS,
  DAILY_LIMIT,
  RATE_LIMIT,
  period,
  resetsAt,
  terminal,
  usesModel,
} from './execution.js';
import type { ExecutionRequest, WorkerEvent } from './execution.js';

export function admissionBudget(
  input: Pick<ExecutionRequest, 'mode' | 'kind'>,
) {
  const tracked = !!input.mode || input.kind === 'analysis';

  return tracked ? TUTOR_ATTEMPT_BUDGET : ATTEMPT_BUDGET;
}

export function activeStudyStep<T>(
  step: T | undefined,
  sessionAvailable = true,
): T {
  if (!step || !sessionAvailable) {
    throw new ExecutionError('conflict', 'No active study step.');
  }

  return step;
}

export function attemptBudget(input: unknown) {
  const snapshot = input as Record<string, unknown>;

  if (snapshot.kind === 'generation') {
    return GENERATION_ATTEMPT_BUDGET;
  }

  return usesModel(input) ? TUTOR_ATTEMPT_BUDGET : ATTEMPT_BUDGET;
}

/** A retried generation request key must name the same draft and settings. */
export function assertSameGeneration(
  previous: { workspaceId: string; input: unknown },
  workspaceId: string,
  input: { kind: 'generation'; effort?: string },
) {
  const old = previous.input as Record<string, unknown>;

  if (
    previous.workspaceId !== workspaceId ||
    old.kind !== input.kind ||
    old.effort !== input.effort
  ) {
    throw new ExecutionError(
      'conflict',
      'This request key already identifies a different request.',
    );
  }
}

// A job may hold fewer than MAX_ATTEMPTS when the quota only had room for some.
export function retriesExhausted(job: {
  attempts: number;
  reserved: number;
  input: unknown;
}) {
  return (
    job.attempts >= MAX_ATTEMPTS || job.reserved < attemptBudget(job.input)
  );
}

export type AttemptState = { status?: string; executionId?: string };

export function assertSameRequest(
  previous: { workspaceId: string; input: unknown },
  workspaceId: string,
  input: ExecutionRequest,
) {
  const old = previous.input as Record<string, unknown>;
  if (
    previous.workspaceId !== workspaceId ||
    old.kind !== input.kind ||
    old.prompt !== input.prompt ||
    old.revision !== input.revision ||
    old.mode !== input.mode ||
    old.effort !== input.effort ||
    old.activeFile !== input.activeFile ||
    JSON.stringify(old.selection) !== JSON.stringify(input.selection) ||
    JSON.stringify(old.sourceIds) !== JSON.stringify(input.sourceIds)
  ) {
    throw new ExecutionError(
      'conflict',
      'This request key already identifies a different request.',
    );
  }
}

export function assertSavedRevision(saved: number, requested: number) {
  if (saved !== requested) {
    throw new ExecutionError(
      'conflict',
      'Save and reload the workspace before starting an execution.',
    );
  }
}

export function assertSavedSelection(
  input: ExecutionRequest,
  files: Record<string, string>,
) {
  if (
    input.activeFile &&
    (!Object.hasOwn(files, input.activeFile) || input.activeFile.endsWith('/'))
  ) {
    throw new ExecutionError(
      'invalid',
      'Select a file in the saved workspace.',
    );
  }

  if (input.selection) {
    const content = input.activeFile ? files[input.activeFile] : undefined;
    if (
      content === undefined ||
      input.selection.start > input.selection.end ||
      input.selection.end > content.length
    ) {
      throw new ExecutionError(
        'invalid',
        'Selection is outside the saved file.',
      );
    }
  }
}

export function solutionEligible(savedAttempts: number) {
  return savedAttempts >= 3;
}

export function assertSolutionEligible(
  mode: ExecutionRequest['mode'],
  allowed: boolean,
) {
  if (mode === 'solution' && !allowed) {
    throw new ExecutionError(
      'forbidden',
      'Solution guidance requires three saved attempts on different revisions of this step.',
    );
  }
}

export function assertAnalysisRetry(
  state: AttemptState,
  runningStatus?: string,
) {
  if (state.status === 'approved' || state.status === 'needs_work') {
    throw new ExecutionError(
      'conflict',
      'This revision was already analyzed. Save a change before analyzing again.',
    );
  }

  if (
    state.status === 'evaluating' &&
    state.executionId &&
    runningStatus &&
    !terminal(runningStatus)
  ) {
    throw new ExecutionError(
      'conflict',
      'An analysis of this revision is already running.',
    );
  }
}

export function rateWindowStart(now: Date) {
  return new Date(now.getTime() - 60_000);
}

export function assertRateLimit(recent: number) {
  if (recent >= RATE_LIMIT) {
    throw new ExecutionError(
      'rate_limited',
      'Execution rate limit reached. Retry in one minute.',
    );
  }
}

export function allocateQuota(
  quota: { used: number; reserved: number },
  budget: number,
  now: Date,
) {
  const remaining = DAILY_LIMIT - quota.used - quota.reserved;
  const attempts = Math.min(MAX_ATTEMPTS, Math.floor(remaining / budget));
  if (attempts < 1) {
    const left = Math.max(0, remaining);
    const reset = period(new Date(resetsAt(now)));

    throw new ExecutionError(
      'rate_limited',
      `Not enough daily token quota for this request (${left} left, ${budget} needed). It resets on ${reset} at 00:00 UTC.`,
    );
  }

  return budget * attempts;
}

type LeaseSnapshot = {
  status: string;
  deadline: Date;
  leaseUntil: Date | null;
  attempts: number;
  reserved: number;
  input: unknown;
};

export function claimDecision(
  job: LeaseSnapshot,
  now: Date,
):
  | { action: 'ignore'; status: string }
  | { action: 'finish'; status: 'timed_out' | 'failed' }
  | { action: 'claim'; status: 'running' } {
  if (terminal(job.status)) {
    return { action: 'ignore' as const, status: job.status };
  }
  if (job.deadline <= now) {
    return { action: 'finish' as const, status: 'timed_out' };
  }
  if (job.leaseUntil && job.leaseUntil > now) {
    return { action: 'ignore' as const, status: 'busy' };
  }
  if (retriesExhausted(job)) {
    return { action: 'finish' as const, status: 'failed' };
  }

  return { action: 'claim' as const, status: 'running' };
}

export function failureDecision(
  job: {
    status: string;
    lease: string | null;
    attempts: number;
    reserved: number;
    input: unknown;
  },
  lease: string,
):
  | { action: 'ignore'; status: string }
  | { action: 'finish'; status: 'failed' }
  | { action: 'release'; status: 'retry' } {
  if (terminal(job.status) || job.lease !== lease) {
    return { action: 'ignore' as const, status: job.status };
  }
  if (retriesExhausted(job)) {
    return { action: 'finish' as const, status: 'failed' };
  }

  return { action: 'release' as const, status: 'retry' };
}

export function activeLease(
  job: {
    status: string;
    lease: string | null;
    leaseUntil: Date | null;
    deadline: Date;
  },
  lease: string,
  leaseNow: Date,
  deadlineNow: Date,
) {
  return (
    job.status === 'running' &&
    job.lease === lease &&
    !!job.leaseUntil &&
    job.leaseUntil > leaseNow &&
    job.deadline > deadlineNow
  );
}

export function usageRefund(
  job: { input: unknown; leases: string[]; settledLeases: string[] },
  event: WorkerEvent,
) {
  const budget = attemptBudget(job.input);
  if (event.tokens > budget) {
    throw new ExecutionError(
      'invalid',
      'Usage exceeds the authorized attempt budget.',
    );
  }

  if (
    event.status !== 'running' &&
    job.leases.includes(event.lease) &&
    !job.settledLeases.includes(event.lease)
  ) {
    return budget - event.tokens;
  }

  return null;
}

export function acceptsEvent(
  job: { lease: string | null; eventIndex: number; status: string },
  event: WorkerEvent,
) {
  return (
    job.lease === event.lease &&
    job.eventIndex < event.index &&
    !terminal(job.status)
  );
}

export function analysisOutcome(
  snapshot: {
    id: string;
    revision: number;
    stepId: string;
    criteria: string[];
  },
  executionId: string,
  status: string,
  evaluation: unknown,
  now: Date,
) {
  let assessment: ReturnType<typeof assessEvaluation> = {
    valid: false,
    reason: status === 'completed' ? 'no_evaluation' : status,
  };
  if (status === 'completed' && evaluation !== undefined) {
    assessment = assessEvaluation(evaluation, snapshot);
  }

  if (!assessment.valid) {
    return {
      approved: false,
      result: {
        status: 'analysis_failed',
        executionId,
        reason: assessment.reason,
        finishedAt: now.toISOString(),
      },
    };
  }

  return {
    approved: assessment.approved,
    result: {
      status: assessment.approved ? 'approved' : 'needs_work',
      executionId,
      evaluatedAt: now.toISOString(),
      evaluation: assessment.evaluation,
    },
  };
}
