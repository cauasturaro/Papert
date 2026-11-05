import { ExecutionError } from './execution.js';
import type { ExecutionRequest } from './execution.js';
import { ATTEMPT_BUDGET, TUTOR_ATTEMPT_BUDGET, RATE_LIMIT } from './quota.js';

export const DEADLINE_MS = 15 * 60 * 1000;

export function admissionBudget(
  input: Pick<ExecutionRequest, 'mode' | 'kind'>,
) {
  const tracked = !!input.mode || input.kind === 'analysis';

  return tracked ? TUTOR_ATTEMPT_BUDGET : ATTEMPT_BUDGET;
}

export function activeStudyStep<T>(
  step: T | undefined,
  sessionAvailable = true,
): T {
  if (!step || !sessionAvailable) {
    throw new ExecutionError('conflict', 'No active study step.');
  }

  return step;
}

/** A retried draft request key (generation or recommendation) must name the same draft and settings. */
export function assertSameDraftRequest(
  previous: { workspaceId: string; input: unknown },
  workspaceId: string,
  input: { kind: 'generation' | 'recommendation'; effort?: string },
) {
  const old = previous.input as Record<string, unknown>;

  if (
    previous.workspaceId !== workspaceId ||
    old.kind !== input.kind ||
    old.effort !== input.effort
  ) {
    throw new ExecutionError(
      'conflict',
      'This request key already identifies a different request.',
    );
  }
}

export function assertSameRequest(
  previous: { workspaceId: string; input: unknown },
  workspaceId: string,
  input: ExecutionRequest,
) {
  const old = previous.input as Record<string, unknown>;
  if (
    previous.workspaceId !== workspaceId ||
    old.kind !== input.kind ||
    old.prompt !== input.prompt ||
    old.revision !== input.revision ||
    old.mode !== input.mode ||
    old.effort !== input.effort ||
    old.activeFile !== input.activeFile ||
    JSON.stringify(old.selection) !== JSON.stringify(input.selection) ||
    JSON.stringify(old.sourceIds) !== JSON.stringify(input.sourceIds)
  ) {
    throw new ExecutionError(
      'conflict',
      'This request key already identifies a different request.',
    );
  }
}

export function assertSavedRevision(saved: number, requested: number) {
  if (saved !== requested) {
    throw new ExecutionError(
      'conflict',
      'Save and reload the workspace before starting an execution.',
    );
  }
}

export function assertSavedSelection(
  input: ExecutionRequest,
  files: Record<string, string>,
) {
  if (
    input.activeFile &&
    (!Object.hasOwn(files, input.activeFile) || input.activeFile.endsWith('/'))
  ) {
    throw new ExecutionError(
      'invalid',
      'Select a file in the saved workspace.',
    );
  }

  if (input.selection) {
    const content = input.activeFile ? files[input.activeFile] : undefined;
    if (
      content === undefined ||
      input.selection.start > input.selection.end ||
      input.selection.end > content.length
    ) {
      throw new ExecutionError(
        'invalid',
        'Selection is outside the saved file.',
      );
    }
  }
}

export function solutionEligible(savedAttempts: number) {
  return savedAttempts >= 3;
}

export function assertSolutionEligible(
  mode: ExecutionRequest['mode'],
  allowed: boolean,
) {
  if (mode === 'solution' && !allowed) {
    throw new ExecutionError(
      'forbidden',
      'Solution guidance requires three saved attempts on different revisions of this step.',
    );
  }
}

export function rateWindowStart(now: Date) {
  return new Date(now.getTime() - 60_000);
}

export function assertRateLimit(recent: number) {
  if (recent >= RATE_LIMIT) {
    throw new ExecutionError(
      'rate_limited',
      'Execution rate limit reached. Retry in one minute.',
    );
  }
}
