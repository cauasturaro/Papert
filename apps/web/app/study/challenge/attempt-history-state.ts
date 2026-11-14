import { RequestError } from "../../../lib/api/request-error.ts";
import type { Workspace } from "../study-api";
import type { AttemptPage, AttemptSummary } from "./attempts-api";

export function unsupportedAttemptHistory(error: unknown) {
  if (!(error instanceof RequestError)) {
    return false;
  }

  return error.status === 405 || error.status === 501 ||
    (error.status === 404 && /^Cannot GET \/.*\/workspaces\/[^/]+\/attempts(?:\?|$)/.test(error.message));
}

// Summaries from the loaded workspace, used until (or when) the paged list is unavailable.
export function summariesOf(workspace: Workspace): AttemptSummary[] {
  const steps = workspace.roadmap.definition.steps;

  return workspace.attempts.map((attempt) => {
    const stepIndex = steps.findIndex((step) => step.id === attempt.stepId);

    return {
      id: attempt.id,
      stepId: attempt.stepId,
      stepIndex,
      stepTitle: steps[stepIndex]?.title ?? null,
      revision: attempt.revision,
      challenge: attempt.challenge,
      result: attempt.result,
      createdAt: attempt.createdAt,
    };
  });
}

export function uniqueAttempts(attempts: AttemptSummary[]) {
  const seen = new Set<string>();

  return attempts.filter((attempt) => {
    if (seen.has(attempt.id)) {
      return false;
    }

    seen.add(attempt.id);

    return true;
  });
}


export function nextAttemptCursor(last: AttemptPage, pages: AttemptPage[]) {
  const earlier = new Set(
    pages.slice(0, -1).flatMap((page) => page.items.map((item) => item.id)),
  );
  const added = last.items.some((item) => !earlier.has(item.id));

  return added ? last.nextCursor : null;
}
