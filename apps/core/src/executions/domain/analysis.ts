import { ExecutionError, terminal } from './execution.js';
import { assessEvaluation } from './evaluation.js';
import type { Evaluation } from './evaluation.js';

export type AttemptState = { status?: string; executionId?: string };

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

export function analysisOutcome(
  snapshot: {
    id: string;
    revision: number;
    stepId: string;
    criteria: string[];
  },
  executionId: string,
  status: string,
  evaluation: Evaluation | null | undefined,
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
