import type { ExecutionSnapshot } from '../execution-snapshot.js';
import { ExecutionError } from '../execution.js';
import type { ExecutionRequest } from '../execution.js';
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

/**
 * The step a request works on. After the last approval Seymour still answers questions and
 * teaches against the final step; analysis, review and solution guidance end with the roadmap.
 */
export function studyStepFor<T>(
  steps: T[],
  currentStep: number,
  input: Pick<ExecutionRequest, 'kind' | 'mode'>,
  sessionAvailable = true,
): T {
  const completed = steps.length > 0 && currentStep >= steps.length;

  if (!completed) {
    return activeStudyStep(steps[currentStep], sessionAvailable);
  }

  if (input.kind === 'analysis') {
    throw new ExecutionError(
      'conflict',
      'You completed this roadmap, so there is nothing left to check.',
    );
  }

  if (input.mode === 'review' || input.mode === 'solution') {
    throw new ExecutionError(
      'conflict',
      'You completed this roadmap. Seymour can still answer questions and teach about it.',
    );
  }

  return activeStudyStep(steps[steps.length - 1], sessionAvailable);
}

/** A retried draft request key (generation or recommendation) must name the same draft and settings. */
export function assertSameDraftRequest(
  previous: { workspaceId: string; input: ExecutionSnapshot },
  workspaceId: string,
  input: { kind: 'generation' | 'recommendation'; effort?: string },
) {
  const old = previous.input;

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
  previous: { workspaceId: string; input: ExecutionSnapshot },
  workspaceId: string,
  input: ExecutionRequest,
) {
  const old = previous.input;
  if (
    previous.workspaceId !== workspaceId ||
    old.kind !== input.kind ||
    old.prompt !== input.prompt ||
    old.revision !== input.revision ||
    old.mode !== input.mode ||
    old.effort !== input.effort ||
    old.activeFile !== input.activeFile ||
    JSON.stringify(old.selection) !== JSON.stringify(input.selection) ||
    JSON.stringify(old.sourceIds) !== JSON.stringify(input.sourceIds) ||
    // The stored snapshot names the resolved conversation even when the request omitted it.
    (input.conversationId !== undefined &&
      old.conversationId !== input.conversationId)
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

/** `analyzedAttempts` counts analyzed needs_work attempts on distinct code for the step. */
export function solutionEligible(analyzedAttempts: number) {
  return analyzedAttempts >= 3;
}

export function assertSolutionEligible(
  mode: ExecutionRequest['mode'],
  allowed: boolean,
) {
  if (mode === 'solution' && !allowed) {
    throw new ExecutionError(
      'forbidden',
      'Solution guidance unlocks after three analyzed attempts on different versions of your code for this step.',
    );
  }
}

export function rateWindowStart(now: Date) {
  return new Date(now.getTime() - 60_000);
}

/** Seconds until the oldest request in the one-minute window leaves it; at least one. */
export function rateLimitWait(oldestInWindow: Date | null, now: Date) {
  if (!oldestInWindow) {
    return 60;
  }

  const leavesAt = oldestInWindow.getTime() + 60_000;
  const seconds = Math.ceil((leavesAt - now.getTime()) / 1000);

  return Math.min(60, Math.max(1, seconds));
}

export function assertRateLimit(recent: number, retryAfterSeconds = 60) {
  if (recent >= RATE_LIMIT) {
    throw new ExecutionError(
      'rate_limited',
      'Too many requests in the last minute. Wait a moment and try again.',
      retryAfterSeconds,
    );
  }
}
