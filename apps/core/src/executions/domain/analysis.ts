import { ExecutionError, terminal } from './execution.js';
import { assessEvaluation } from './evaluation.js';
import type { Evaluation } from './evaluation.js';
import type { EvaluatedAnalysis } from './ports/execution-engagement.js';
import type {
  AttemptOutcome,
  RecordedOutcome,
} from './ports/execution-study-progression.js';

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
): AttemptOutcome {
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
      status: 'analysis_failed',
      result: {
        status: 'analysis_failed',
        executionId,
        reason: assessment.reason,
        finishedAt: now.toISOString(),
      },
    };
  }

  const outcome = assessment.approved ? 'approved' : 'needs_work';

  return {
    approved: assessment.approved,
    status: outcome,
    result: {
      status: outcome,
      executionId,
      evaluatedAt: now.toISOString(),
      evaluation: assessment.evaluation,
    },
  };
}

/** The study activity an outcome represents: only an evaluation Core accepted counts. */
export function evaluatedAnalysis(
  execution: { id: string; userId: string; workspaceId: string },
  recorded: RecordedOutcome | null,
  evaluatedAt: Date,
): EvaluatedAnalysis | null {
  if (!recorded) {
    return null;
  }

  if (recorded.status === 'analysis_failed') {
    return null;
  }

  return {
    userId: execution.userId,
    executionId: execution.id,
    workspaceId: execution.workspaceId,
    approved: recorded.status === 'approved',
    evaluatedAt,
    completedRoadmap: recorded.completedRoadmap,
  };
}
