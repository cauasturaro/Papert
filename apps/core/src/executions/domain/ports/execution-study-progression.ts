// Owned by this port so executions does not depend on study domain types.
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

export type CompletedRoadmap = {
  roadmapId: string;
  workspaceId: string;
  title: string;
  stepCount: number;
  concepts: string[];
};

/** The attempt status Study wrote, and the roadmap this outcome completed, if it did. */
export type RecordedOutcome = {
  status: OutcomeStatus;
  completedRoadmap: CompletedRoadmap | null;
};

// Only infrastructure may unwrap this caller-owned transaction; no nested transaction is started.
export type ProgressionTransaction = object;

export interface ExecutionStudyProgression {
  definition(value: unknown): { description: string; steps: ProgressionStep[] };
  snapshot(
    tx: ProgressionTransaction,
    workspaceId: string,
    revision: number,
    step: ProgressionStep,
    files: unknown,
  ): Promise<{ id: string; revision: number; stepId: string; result: unknown }>;
  recent(
    tx: ProgressionTransaction,
    workspaceId: string,
    stepId: string,
  ): Promise<{ revision: number; result: unknown }[]>;
  // Analyzed needs_work attempts on distinct code for the step; they unlock Solution guidance.
  analyzedAttempts(
    tx: ProgressionTransaction,
    workspaceId: string,
    stepId: string,
  ): Promise<number>;
  updateResult(
    tx: ProgressionTransaction,
    id: string,
    result: Record<string, unknown>,
  ): Promise<{ id: string; revision: number; stepId: string; result: unknown }>;
  // Null when the execution is not the pending analysis of an attempt.
  recordOutcome(
    tx: ProgressionTransaction,
    execution: { id: string; workspaceId: string; input: unknown },
    assess: (snapshot: OutcomeSnapshot) => AttemptOutcome,
  ): Promise<RecordedOutcome | null>;
}
