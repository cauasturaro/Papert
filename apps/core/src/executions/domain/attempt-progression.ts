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
  updateResult(
    tx: ProgressionTransaction,
    id: string,
    result: Record<string, unknown>,
  ): Promise<{ id: string; revision: number; stepId: string; result: unknown }>;
  recordOutcome(
    tx: ProgressionTransaction,
    execution: { id: string; workspaceId: string; input: unknown },
    assess: (snapshot: OutcomeSnapshot) => AttemptOutcome,
  ): Promise<void>;
}
