import { DomainError } from '../../common/domain/domain-error.js';

export class MemoryError extends DomainError {}

export type MemoryKind = 'preference' | 'difficulty';

/** Proposed items wait for the learner; only active items reach Seymour. */
export type MemoryStatus = 'proposed' | 'active';

export type MemoryOrigin = 'learner' | 'seymour';

/** A durable (L3) memory: a learner preference or difficulty kept across conversations. */
export type MemoryItem = {
  id: string;
  kind: MemoryKind;
  text: string;
  status: MemoryStatus;
  origin: MemoryOrigin;
  executionId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** What a conversation summary keeps of the turns it folded. */
export type SummaryContent = {
  covered: string[];
  pending: string[];
  struggles: string[];
};

/** Stored summary: the content plus the step it was written at, set by Core. */
export type ConversationSummary = SummaryContent & { stepId: string };

/** The last folded turn; turns at or before it are represented by the summary. */
export type SummaryCursor = { id: string; at: Date };

/** An L2 session of the tutor chat inside one workspace. */
export type Conversation = {
  id: string;
  workspaceId: string;
  title: string | null;
  summary: ConversationSummary | null;
  summaryThrough: SummaryCursor | null;
  summarySourceIds: string[];
  createdAt: Date;
  lastActiveAt: Date;
};
