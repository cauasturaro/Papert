import { ExecutionError } from '../execution.js';

// Context the tutor receives besides the saved workspace: sources, history and durable notes.

export type TutorSource = { id: string; filename: string; format: string };

export type TutorTurn = { prompt: string; answer: string };

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
 * Drops durable notes deleted after admission, so a queued or retried job never sends them.
 * Other kinds of input are returned unchanged.
 */
export function withLiveNotes(input: unknown, liveIds: string[]) {
  const snapshot = input as { memory?: { id: string }[] };

  if (!Array.isArray(snapshot.memory)) {
    return input;
  }

  const live = new Set(liveIds);
  const memory = snapshot.memory.filter((note) => live.has(note.id));

  return { ...snapshot, memory };
}

/** Ids of the durable notes snapshotted into a tutor execution. */
export function admittedNoteIds(input: unknown) {
  const snapshot = input as { memory?: { id?: unknown }[] };

  if (!Array.isArray(snapshot.memory)) {
    return [];
  }

  return snapshot.memory
    .map((note) => note.id)
    .filter((id): id is string => typeof id === 'string');
}
