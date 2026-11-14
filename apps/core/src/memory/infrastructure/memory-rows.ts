import type {
  MemoryItem as MemoryItemRow,
  TutorConversation as ConversationRow,
} from '@prisma/client';
import type {
  Conversation,
  ConversationSummary,
  MemoryItem,
  MemoryKind,
  MemoryOrigin,
  MemoryStatus,
} from '../domain/memory.js';

export function toMemoryItem(row: MemoryItemRow): MemoryItem {
  return {
    id: row.id,
    kind: row.kind as MemoryKind,
    text: row.text,
    status: row.status as MemoryStatus,
    origin: row.origin as MemoryOrigin,
    executionId: row.executionId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toConversation(row: ConversationRow): Conversation {
  const through =
    row.summaryThroughId && row.summaryThroughAt
      ? { id: row.summaryThroughId, at: row.summaryThroughAt }
      : null;

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    summary: row.summary as ConversationSummary | null,
    summaryThrough: through,
    summarySourceIds: row.summarySourceIds,
    createdAt: row.createdAt,
    lastActiveAt: row.lastActiveAt,
  };
}
