import {
  errorKind,
  isRetryable,
  retryAfterMs,
  toLearnerMessage,
} from "../../../lib/api/learner-error.ts";
import { retryDelay, type SaveFailure } from "./save-state.ts";

export type SaveFailureOutcome =
  // Another tab or device saved first; the learner chooses which version to keep.
  | { type: "conflict" }
  // `failure` is null when autosave just waits (offline until reconnection).
  | { type: "failure"; failure: SaveFailure | null; retried: boolean };

type Context = {
  // Automatic retries already made for the current draft.
  attempts: number;
  online: boolean;
  now: number;
};

/** What a failed autosave means for the editor: a conflict, a scheduled retry or a stop. */
export function classifySaveFailure(
  error: unknown,
  { attempts, online, now }: Context,
): SaveFailureOutcome {
  const kind = errorKind(error);
  const message = toLearnerMessage(error, now);

  if (kind === "conflict") {
    return { type: "conflict" };
  }

  if (kind === "validation") {
    return {
      type: "failure",
      failure: { kind: "invalid", message },
      retried: false,
    };
  }

  const offline = kind === "network" && !online;

  if (isRetryable(error) && !offline) {
    const delay = retryDelay(attempts, retryAfterMs(error, now));

    return {
      type: "failure",
      failure: { kind: "retrying", message, retryAt: now + delay },
      retried: true,
    };
  }

  // Offline resumes on reconnection and an expired session after sign-in.
  return {
    type: "failure",
    failure: offline ? null : { kind: "failed", message },
    retried: false,
  };
}
