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
export type OutcomeStatus = 'approved' | 'needs_work' | 'analysis_failed';

export type AttemptOutcome = {
  approved: boolean;
  status: OutcomeStatus;
  result: Record<string, unknown>;
};

// Only infrastructure may unwrap this caller-owned transaction; no nested transaction is started.
export type ProgressionTransaction = object;

/** A roadmap whose last step this outcome unlocked, as Study recorded it. */
export type CompletedRoadmap = {
  roadmapId: string;
  workspaceId: string;
  title: string;
  stepCount: number;
  concepts: string[];
};

/** What an outcome changed: the attempt status written and a completion, if any. */
export type RecordedOutcome = {
  status: OutcomeStatus;
  completedRoadmap: CompletedRoadmap | null;
};

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
    return { applies, advance: false, nextStep: null, completes: false };
  }

  const index = progression.steps.findIndex(
    (step) => step.id === attempt.stepId,
  );
  const advance = index >= 0 && progression.currentStep === index;
  const nextStep = advance ? index + 1 : null;
  // `currentStep == steps.length` is the completed roadmap.
  const completes = nextStep === progression.steps.length;

  return { applies, advance, nextStep, completes };
}

export function completedRoadmap(
  roadmap: {
    id: string;
    title: string;
    steps: { concepts?: string[] }[];
  },
  workspaceId: string,
): CompletedRoadmap {
  const concepts = roadmap.steps.flatMap((step) => step.concepts ?? []);

  return {
    roadmapId: roadmap.id,
    workspaceId,
    title: roadmap.title,
    stepCount: roadmap.steps.length,
    concepts: [...new Set(concepts)],
  };
}
