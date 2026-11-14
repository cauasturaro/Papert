import { describe, expect, it } from 'vitest';
import {
  completedTurn,
  conversationTurn,
  DELETED_SOURCE_ANSWER,
  FOLD_BATCH,
  historyWindow,
  WINDOW_TURNS,
} from './conversation-window.js';
import type { ConversationTurn } from './conversation-window.js';

const start = new Date('2026-11-05T10:00:00Z').getTime();

function turns(count: number, cited: (index: number) => string[] = () => []) {
  return Array.from({ length: count }, (_, index): ConversationTurn => ({
    id: `turn-${String(index).padStart(2, '0')}`,
    createdAt: new Date(start + index * 1000),
    prompt: `question ${index}`,
    answer: `answer ${index}`,
    citedSourceIds: cited(index),
  }));
}

const empty = { summary: null, summaryThrough: null, summarySourceIds: [] };

describe('conversation turns', () => {
  it('reads tutor chats with their cited sources and skips other jobs', () => {
    const chat = conversationTurn({
      id: 'chat',
      createdAt: new Date(start),
      input: { kind: 'chat' as const, mode: 'doubt' as const, prompt: 'Why?' },
      text: 'Because.',
      grounding: { citations: [{ sourceId: 's1' }, { sourceId: 's1' }] },
    });
    const analysis = conversationTurn({
      id: 'analysis',
      createdAt: new Date(start),
      input: { kind: 'analysis' },
      text: '',
      grounding: null,
    });

    expect(chat).toMatchObject({
      prompt: 'Why?',
      answer: 'Because.',
      citedSourceIds: ['s1'],
    });
    expect(analysis).toBeNull();
  });
});

describe('history window', () => {
  it('sends short conversations verbatim without folding', () => {
    const window = historyWindow(turns(3), empty, []);

    expect(window.recentTurns.map((turn) => turn.prompt)).toEqual([
      'question 0',
      'question 1',
      'question 2',
    ]);
    expect(window.foldTurns).toEqual([]);
    expect(window.fold).toBeNull();
  });

  it('keeps the newest turns and folds the oldest batch of a long conversation', () => {
    const history = turns(7, (index) => (index === 1 ? ['s1'] : []));

    const window = historyWindow(history, empty, ['s1']);

    expect(window.recentTurns).toHaveLength(WINDOW_TURNS);
    expect(window.recentTurns[0].prompt).toBe('question 3');
    expect(window.foldTurns.map((turn) => turn.prompt)).toEqual([
      'question 0',
      'question 1',
      'question 2',
    ]);
    expect(window.fold).toEqual({
      throughId: 'turn-02',
      throughAt: history[FOLD_BATCH - 1].createdAt.toISOString(),
      sourceIds: ['s1'],
    });
  });

  it('only counts turns after the summary cursor', () => {
    const history = turns(9);
    const conversation = {
      summary: { covered: ['ports'] },
      summaryThrough: { id: 'turn-02', at: history[2].createdAt },
      summarySourceIds: [],
    };

    const window = historyWindow(history, conversation, []);

    expect(window.summary).toEqual({ covered: ['ports'] });
    expect(window.recentTurns.map((turn) => turn.prompt)).toEqual([
      'question 5',
      'question 6',
      'question 7',
      'question 8',
    ]);
    expect(window.fold).toBeNull();
  });

  it('hides answers that cite a deleted source and keeps them out of the next summary', () => {
    const history = turns(7, (index) =>
      index === 0 || index === 6 ? ['deleted'] : [],
    );

    const window = historyWindow(history, empty, []);

    expect(window.recentTurns[3]).toEqual({
      prompt: 'question 6',
      answer: DELETED_SOURCE_ANSWER,
    });
    expect(window.foldTurns[0].answer).toBe(DELETED_SOURCE_ANSWER);
    expect(window.fold?.sourceIds).toEqual([]);
  });

  it('drops a summary built from a source that was deleted since', () => {
    const conversation = {
      summary: { covered: ['quoted the guide'] },
      summaryThrough: { id: 'turn-00', at: new Date(start - 1000) },
      summarySourceIds: ['deleted', 'kept'],
    };

    const window = historyWindow(turns(7), conversation, ['kept']);

    expect(window.summary).toBeNull();
    expect(window.dropSummary).toBe(true);
    expect(window.fold?.sourceIds).toEqual([]);
  });
});

describe('completed turns', () => {
  const fold = {
    throughId: 'turn-02',
    throughAt: '2026-11-05T10:00:02.000Z',
    sourceIds: [],
  };
  const chat = {
    id: 'execution',
    userId: 'user',
    input: {
      kind: 'chat' as const,
      mode: 'doubt' as const,
      conversationId: 'c',
      stepId: 's',
      summaryFold: fold,
    },
  };

  it('reports a completed tutor chat with its fold from Core’s snapshot', () => {
    expect(completedTurn(chat, 'completed')).toEqual({
      executionId: 'execution',
      userId: 'user',
      conversationId: 'c',
      stepId: 's',
      fold,
    });
  });

  it('ignores other outcomes and other kinds of jobs', () => {
    const analysis = {
      ...chat,
      input: { kind: 'analysis' as const, stepId: 's' },
    };
    const transport = {
      ...chat,
      input: { kind: 'chat' as const, conversationId: 'c', stepId: 's' },
    };

    expect(completedTurn(chat, 'cancelled')).toBeNull();
    expect(completedTurn(analysis, 'completed')).toBeNull();
    expect(completedTurn(transport, 'completed')).toBeNull();
  });
});
