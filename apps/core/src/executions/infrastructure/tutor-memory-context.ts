import { executionRecord } from './execution-snapshot.js';
import type { Prisma } from '@prisma/client';
import { ExecutionError } from '../domain/execution.js';
import type { ExecutionRequest } from '../domain/execution.js';
import {
  conversationTurn,
  HISTORY_LOOKUP,
  historyWindow,
} from '../domain/tutor/conversation-window.js';
import type { ConversationTurn } from '../domain/tutor/conversation-window.js';
import type { ExecutionMemory } from '../domain/ports/execution-memory.js';
import type { TutorMemoryContext } from '../application/worker-context.js';

/**
 * Reads the L2/L3 context of a tutor request inside the admission transaction, after the
 * workspace lock: conversation, its unsummarized turns, durable notes. Lock order stays
 * quota → workspace → conversation.
 */
export async function tutorMemoryContext(
  tx: Prisma.TransactionClient,
  memory: ExecutionMemory,
  userId: string,
  workspaceId: string,
  input: ExecutionRequest,
  liveSourceIds: string[],
  now: Date,
): Promise<TutorMemoryContext> {
  const conversation = await memory.conversation(
    tx,
    userId,
    workspaceId,
    input.conversationId,
    input.prompt ?? '',
    now,
  );
  if (!conversation) {
    throw new ExecutionError('not_found', 'Conversation not found.');
  }

  const cursor = conversation.summaryThrough;
  const rows = await tx.execution.findMany({
    where: {
      conversationId: conversation.id,
      userId,
      status: 'completed',
      ...(cursor ? { createdAt: { gte: cursor.at } } : {}),
    },
    select: {
      id: true,
      createdAt: true,
      input: true,
      text: true,
      grounding: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: HISTORY_LOOKUP,
  });
  const turns = rows
    .reverse()
    .map(executionRecord)
    .map(conversationTurn)
    .filter((turn): turn is ConversationTurn => turn !== null);

  const window = historyWindow(turns, conversation, liveSourceIds);
  if (window.dropSummary) {
    await memory.dropSummary(tx, conversation.id);
  }

  const notes = await memory.notes(tx, userId, now);

  return {
    conversationId: conversation.id,
    summary: window.summary,
    recentTurns: window.recentTurns,
    foldTurns: window.foldTurns,
    summaryFold: window.fold,
    memory: notes,
  };
}
