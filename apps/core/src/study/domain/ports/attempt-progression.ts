import type {
  ProgressionTransaction,
  ProgressionStep,
  OutcomeSnapshot,
  AttemptOutcome,
  RecordedOutcome,
} from '../attempt-progression.js';

export interface AttemptProgression {
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
  ): Promise<RecordedOutcome | null>;
}
