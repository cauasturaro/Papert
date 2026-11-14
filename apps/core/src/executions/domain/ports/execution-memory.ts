// Owned by this port so executions does not depend on memory domain types.

// Only infrastructure may unwrap this caller-owned transaction; no nested transaction is started.
export type MemoryTransaction = object;

export type TutorSummary = {
  covered: string[];
  pending: string[];
  struggles: string[];
  stepId: string;
};

export type TutorConversation = {
  id: string;
  summary: TutorSummary | null;
  summaryThrough: { id: string; at: Date } | null;
  summarySourceIds: string[];
};

/** A completed tutor turn, read from Core's own admission snapshot. */
export type CompletedTurn = {
  executionId: string;
  userId: string;
  conversationId: string;
  stepId: string;
  fold: { throughId: string; throughAt: string; sourceIds: string[] } | null;
};

export type TutorNote = {
  id: string;
  kind: 'preference' | 'difficulty';
  text: string;
};

/**
 * Memory's participant in admission and settlement transactions; implemented by Memory, so
 * executions never reads conversation or memory tables itself.
 */
export interface ExecutionMemory {
  // The requested conversation of this workspace, or its most recent one (created when there is
  // none); marks it active and names it after its first prompt. Null when the id is not this
  // learner's conversation in this workspace. The caller already locked the workspace.
  conversation(
    tx: MemoryTransaction,
    userId: string,
    workspaceId: string,
    conversationId: string | undefined,
    prompt: string,
    now: Date,
  ): Promise<TutorConversation | null>;
  // Forgets a summary built from a source that was deleted since.
  dropSummary(tx: MemoryTransaction, conversationId: string): Promise<void>;
  // Active durable items a tutor request may carry.
  notes(tx: MemoryTransaction, userId: string, now: Date): Promise<TutorNote[]>;
  // Records a completed turn's summary and proposal; untrusted `memory` is validated by Memory.
  recordTurn(
    tx: MemoryTransaction,
    turn: CompletedTurn,
    memory: unknown,
    now: Date,
  ): Promise<void>;
}
