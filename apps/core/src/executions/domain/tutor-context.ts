import { ExecutionError } from './execution.js';

// Context the tutor receives besides the saved workspace: sources and recent exchanges.

export type TutorSource = { id: string; filename: string; format: string };

export type TutorTurn = { prompt: string; answer: string };

/** Ready sources of a workspace the user owns; provided by the sources module. */
export interface TutorSourceCatalog {
  ready(userId: string, workspaceId: string): Promise<TutorSource[]>;
}

export const RECENT_TURNS = 3;

/** @-mentions may only name sources that are ready in the workspace. */
export function assertMentionsReady(
  sourceIds: string[] | undefined,
  sources: TutorSource[],
) {
  const ready = new Set(sources.map((source) => source.id));
  const unknown = (sourceIds ?? []).some((id) => !ready.has(id));

  if (unknown) {
    throw new ExecutionError(
      'invalid',
      'Mention only sources that are ready in this workspace.',
    );
  }
}

/**
 * Short-term memory: the last completed tutor exchanges, oldest first.
 * `completed` is newest first and may include analysis or transport jobs.
 */
export function recentTurns(
  completed: { input: unknown; text: string }[],
): TutorTurn[] {
  const chats = completed.filter((execution) => {
    const request = execution.input as Record<string, unknown>;

    return request.kind === 'chat' && !!request.mode;
  });

  return chats
    .slice(0, RECENT_TURNS)
    .reverse()
    .map((execution) => {
      const request = execution.input as Record<string, unknown>;
      const prompt = typeof request.prompt === 'string' ? request.prompt : '';

      return { prompt, answer: execution.text };
    });
}
