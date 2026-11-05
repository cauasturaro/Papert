import type { CompletedTurn } from './ports/execution-memory.js';
import type { TutorTurn } from './tutor-context.js';

// L2 history of a conversation as the tutor sees it: a summary plus the newest turns verbatim.
export const WINDOW_TURNS = 4;
export const FOLD_TRIGGER = 7;
export const FOLD_BATCH = 3;
// Unsummarized turns read per request; enough for the window and one fold.
export const HISTORY_LOOKUP = 12;

export const DELETED_SOURCE_ANSWER =
  'This answer used a source that was deleted, so its text is no longer available.';

export type ConversationTurn = {
  id: string;
  createdAt: Date;
  prompt: string;
  answer: string;
  citedSourceIds: string[];
};

type Cursor = { id: string; at: Date };

export type SummaryFold = {
  throughId: string;
  throughAt: string;
  sourceIds: string[];
};

/** Source ids an answer cites, read from its stored grounding. */
export function citedSourceIds(grounding: unknown) {
  const value = grounding as { citations?: { sourceId?: unknown }[] } | null;

  if (!value || !Array.isArray(value.citations)) {
    return [];
  }

  const ids = value.citations
    .map((citation) => citation.sourceId)
    .filter((id): id is string => typeof id === 'string');

  return [...new Set(ids)];
}

/** A completed tutor exchange; analysis and transport jobs are not conversation turns. */
export function conversationTurn(execution: {
  id: string;
  createdAt: Date;
  input: unknown;
  text: string;
  grounding: unknown;
}): ConversationTurn | null {
  const request = execution.input as Record<string, unknown>;

  if (request.kind !== 'chat' || !request.mode) {
    return null;
  }

  const prompt = typeof request.prompt === 'string' ? request.prompt : '';

  return {
    id: execution.id,
    createdAt: execution.createdAt,
    prompt,
    answer: execution.text,
    citedSourceIds: citedSourceIds(execution.grounding),
  };
}

function after(turn: ConversationTurn, cursor: Cursor | null) {
  if (!cursor) {
    return true;
  }

  const byTime = turn.createdAt.getTime() - cursor.at.getTime();

  if (byTime !== 0) {
    return byTime > 0;
  }

  return turn.id > cursor.id;
}

/**
 * Chooses what of a conversation reaches the model. Answers that cite a deleted source are
 * replaced and a summary built from one is dropped, so deleted text never re-enters a prompt.
 * When enough turns accumulate, the oldest ones are sent to be folded into a new summary.
 */
export function historyWindow<Summary>(
  turns: ConversationTurn[],
  conversation: {
    summary: Summary | null;
    summaryThrough: Cursor | null;
    summarySourceIds: string[];
  },
  liveSourceIds: string[],
) {
  const live = new Set(liveSourceIds);
  const isLive = (id: string) => live.has(id);

  const dropSummary =
    conversation.summary !== null &&
    !conversation.summarySourceIds.every(isLive);
  const summary = dropSummary ? null : conversation.summary;

  const visible = turns
    .filter((turn) => after(turn, conversation.summaryThrough))
    .map((turn) => {
      const available = turn.citedSourceIds.every(isLive);

      return {
        turn,
        sourceIds: available ? turn.citedSourceIds : [],
        exchange: {
          prompt: turn.prompt,
          answer: available ? turn.answer : DELETED_SOURCE_ANSWER,
        } satisfies TutorTurn,
      };
    });

  const recentTurns = visible.slice(-WINDOW_TURNS).map((item) => item.exchange);

  const folded =
    visible.length >= FOLD_TRIGGER ? visible.slice(0, FOLD_BATCH) : [];
  let fold: SummaryFold | null = null;

  if (folded.length > 0) {
    const last = folded[folded.length - 1].turn;
    const kept = summary ? conversation.summarySourceIds : [];
    const sourceIds = new Set([
      ...kept,
      ...folded.flatMap((item) => item.sourceIds),
    ]);

    fold = {
      throughId: last.id,
      throughAt: last.createdAt.toISOString(),
      sourceIds: [...sourceIds],
    };
  }

  return {
    summary,
    dropSummary,
    recentTurns,
    foldTurns: folded.map((item) => item.exchange),
    fold,
  };
}

/**
 * The memory facts of a finished execution, from Core's own snapshot (never from the worker):
 * only a completed tutor chat in a conversation has any.
 */
export function completedTurn(
  execution: { id: string; userId: string; input: unknown },
  status: string,
): CompletedTurn | null {
  const snapshot = execution.input as {
    kind?: string;
    mode?: string;
    conversationId?: string;
    stepId?: string;
    summaryFold?: SummaryFold;
  };

  const tutorChat = snapshot.kind === 'chat' && !!snapshot.mode;
  if (status !== 'completed' || !tutorChat) {
    return null;
  }

  if (!snapshot.conversationId || !snapshot.stepId) {
    return null;
  }

  return {
    executionId: execution.id,
    userId: execution.userId,
    conversationId: snapshot.conversationId,
    stepId: snapshot.stepId,
    fold: snapshot.summaryFold ?? null,
  };
}
