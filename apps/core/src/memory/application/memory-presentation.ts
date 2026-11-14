import type { Conversation, MemoryItem } from '../domain/memory.js';

export function memoryItemView(item: MemoryItem) {
  return {
    id: item.id,
    kind: item.kind,
    text: item.text,
    status: item.status,
    origin: item.origin,
    // Lets the tutor panel show a proposal under the answer that suggested it.
    executionId: item.executionId,
    expiresAt: item.expiresAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/** Learners can read what Seymour kept of earlier turns; cursors and source ids stay private. */
export function conversationView(conversation: Conversation) {
  const { summary } = conversation;

  return {
    id: conversation.id,
    workspaceId: conversation.workspaceId,
    title: conversation.title,
    summary: summary
      ? {
          covered: summary.covered,
          pending: summary.pending,
          struggles: summary.struggles,
        }
      : null,
    createdAt: conversation.createdAt,
    lastActiveAt: conversation.lastActiveAt,
  };
}
