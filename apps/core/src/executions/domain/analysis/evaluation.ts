export type Evaluation = {
  attemptId: string;
  revision: number;
  stepId: string;
  summary: string;
  criteria: { id: string; status: 'met' | 'not_met'; feedback: string }[];
  findings: {
    category: 'logic' | 'contract' | 'structure' | 'security';
    severity: 'info' | 'warning' | 'error';
    path: string | null;
    line?: number | null;
    message: string;
  }[];
  hints: string[];
};

export type AttemptSnapshot = {
  id: string;
  revision: number;
  stepId: string;
  criteria: string[];
};

// Core, not the model, decides approval: every criterion of this exact attempt must be met.
export function assessEvaluation(
  evaluation: Evaluation | null,
  attempt: AttemptSnapshot,
) {
  if (!evaluation) {
    return { valid: false as const, reason: 'invalid_output' };
  }

  if (
    evaluation.attemptId !== attempt.id ||
    evaluation.revision !== attempt.revision ||
    evaluation.stepId !== attempt.stepId
  ) {
    return { valid: false as const, reason: 'other_attempt' };
  }

  const reported = evaluation.criteria.map((criterion) => criterion.id);
  const expected = [...attempt.criteria].sort();
  if (
    reported.length !== expected.length ||
    [...reported].sort().some((id, index) => id !== expected[index])
  ) {
    return { valid: false as const, reason: 'criteria_mismatch' };
  }

  const approved = evaluation.criteria.every(
    (criterion) => criterion.status === 'met',
  );

  return { valid: true as const, approved, evaluation };
}
