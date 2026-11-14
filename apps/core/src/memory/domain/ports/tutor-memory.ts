import type {
  ConversationSummary,
  MemoryKind,
  SummaryCursor,
} from '../memory.js';

// Only infrastructure may unwrap this caller-owned transaction; no nested transaction is started.
export type MemoryTransaction = object;

/** A completed tutor turn as executions reports it; Memory never reads execution snapshots. */
export type CompletedTurn = {
  executionId: string;
  userId: string;
  conversationId: string;
  // The step the turn ran at; a summary written now records it.
  stepId: string;
  // Turns Core asked Seymour to fold in this turn, by cursor; null when nothing was folded.
  fold: { throughId: string; throughAt: string; sourceIds: string[] } | null;
};

/** Driven by executions inside its admission and settlement transactions. */
export interface TutorMemory {
  conversation(
    tx: MemoryTransaction,
    userId: string,
    workspaceId: string,
    conversationId: string | undefined,
    prompt: string,
    now: Date,
  ): Promise<{
    id: string;
    summary: ConversationSummary | null;
    summaryThrough: SummaryCursor | null;
    summarySourceIds: string[];
  } | null>;
  dropSummary(tx: MemoryTransaction, conversationId: string): Promise<void>;
  notes(
    tx: MemoryTransaction,
    userId: string,
    now: Date,
  ): Promise<{ id: string; kind: MemoryKind; text: string }[]>;
  // Records the turn's untrusted summary and proposal; Memory validates both.
  recordTurn(
    tx: MemoryTransaction,
    turn: CompletedTurn,
    memory: unknown,
    now: Date,
  ): Promise<void>;
}
