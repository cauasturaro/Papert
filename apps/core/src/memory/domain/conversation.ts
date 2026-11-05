import type { SummaryCursor } from './memory.js';

export const TITLE_CHARACTERS = 80;
export const CONVERSATION_LIST_LIMIT = 30;

/** The first prompt names the conversation; whitespace collapses and long prompts end in "…". */
export function conversationTitle(prompt: string) {
  const text = prompt.trim().replace(/\s+/g, ' ');
  const characters = [...text];

  if (characters.length === 0) {
    return null;
  }

  if (characters.length <= TITLE_CHARACTERS) {
    return text;
  }

  return `${characters.slice(0, TITLE_CHARACTERS - 1).join('')}…`;
}

/** Turns are ordered by creation time, then id, so a cursor is a total order position. */
export function compareCursors(a: SummaryCursor, b: SummaryCursor) {
  const byTime = a.at.getTime() - b.at.getTime();

  if (byTime !== 0) {
    return byTime;
  }

  if (a.id === b.id) {
    return 0;
  }

  return a.id < b.id ? -1 : 1;
}

/** A summary replaces the stored one only when it folds turns past the stored cursor. */
export function summaryAdvances(
  stored: SummaryCursor | null,
  candidate: SummaryCursor,
) {
  if (!stored) {
    return true;
  }

  return compareCursors(candidate, stored) > 0;
}
