export type ProgressionStep = {
  id: string;
  title: string;
  challenge: {
    instructions: string;
    criteria: { id: string; description: string }[];
  };
};

export type OutcomeSnapshot = {
  id: string;
  revision: number;
  stepId: string;
  criteria: string[];
};
export type AttemptOutcome = {
  approved: boolean;
  result: Record<string, unknown>;
};

// Only infrastructure may unwrap this caller-owned transaction; no nested transaction is started.
export type ProgressionTransaction = object;

export type LockedAttemptOutcome = {
  workspaceId: string;
  stepId: string;
  state: { status?: string; executionId?: string } | null;
};

export function attemptOutcomeDecision(
  attempt: LockedAttemptOutcome | null,
  execution: { workspaceId: string; executionId: string },
  progression?: {
    approved: boolean;
    currentStep: number;
    steps: { id: string }[];
  },
) {
  const applies =
    !!attempt &&
    attempt.workspaceId === execution.workspaceId &&
    attempt.state?.status === 'evaluating' &&
    attempt.state.executionId === execution.executionId;
  if (!applies || !progression?.approved) {
    return { applies, advance: false, nextStep: null };
  }

  const index = progression.steps.findIndex(
    (step) => step.id === attempt.stepId,
  );
  const advance = index >= 0 && progression.currentStep === index;

  return { applies, advance, nextStep: advance ? index + 1 : null };
}
