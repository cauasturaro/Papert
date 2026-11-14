import { formatResetTime, formatWait } from "../format/time.ts";
import {
  isNetworkFailure,
  isReadableMessage,
  kindForStatus,
  RequestError,
  type RequestErrorKind,
} from "./request-error.ts";

function statusOf(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: unknown }).status;

    return typeof status === "number" ? status : null;
  }

  return null;
}

/** The failure kind of any thrown value: `RequestError`, other errors with a `status`, or fetch TypeErrors. */
export function errorKind(error: unknown): RequestErrorKind {
  if (error instanceof RequestError) {
    return error.kind;
  }

  if (isNetworkFailure(error)) {
    return "network";
  }

  const status = statusOf(error);

  if (status !== null) {
    return kindForStatus(status);
  }

  return "unknown";
}

/** Network failures, 5xx and short rate limits may succeed when sent again; quota does not. */
export function isRetryable(error: unknown) {
  const kind = errorKind(error);

  return kind === "network" || kind === "server" || kind === "rate_limited";
}

/**
 * Milliseconds to wait before retrying: Retry-After (or the server's wording) for rate
 * limits, the time until reset for quota. Null when unknown.
 */
export function retryAfterMs(error: unknown, now = Date.now()) {
  if (!(error instanceof RequestError)) {
    return null;
  }

  if (error.retryAfterMs !== null) {
    return error.retryAfterMs;
  }

  if (error.resetsAt !== null) {
    return Math.max(0, error.resetsAt - now);
  }

  return null;
}

function serverMessage(error: unknown) {
  if (error instanceof RequestError) {
    return error.serverMessage;
  }

  // Errors from other helpers (such as AuthRequestError) carry the server copy as `message`.
  if (
    error instanceof Error &&
    statusOf(error) !== null &&
    isReadableMessage(error.message)
  ) {
    return error.message;
  }

  return null;
}

function rateLimitedMessage(error: unknown, now: number) {
  const wait = retryAfterMs(error, now);

  if (wait === null) {
    return "Too many requests in a short time. Wait a moment and try again.";
  }

  return `Too many requests in a short time. Try again in ${formatWait(wait)}.`;
}

function quotaMessage(error: unknown, now: number) {
  const resetsAt = error instanceof RequestError ? error.resetsAt : null;

  if (resetsAt === null) {
    return "You have used today's allowance for Seymour and analyses. It resets tomorrow.";
  }

  return `You have used today's allowance for Seymour and analyses. It ${formatResetTime(resetsAt, now)}.`;
}

/** Short plain-English copy for any failure; never the raw browser or JSON text. */
export function toLearnerMessage(error: unknown, now = Date.now()) {
  const kind = errorKind(error);
  const fromServer = serverMessage(error);

  switch (kind) {
    case "network":
      return "You appear to be offline or Papert cannot be reached. Check your connection and try again.";

    case "session_expired":
      return "Your session ended. Sign in again to continue.";

    case "forbidden":
      return fromServer ?? "You do not have access to this.";

    case "not_found":
      return (
        fromServer ??
        "We could not find this. It may have been moved or deleted."
      );

    case "conflict":
      return (
        fromServer ??
        "This changed somewhere else. Reload to get the latest version."
      );

    case "validation":
      return (
        fromServer ??
        "Some of the details are not valid. Check them and try again."
      );

    case "rate_limited":
      return rateLimitedMessage(error, now);

    case "quota_exhausted":
      return quotaMessage(error, now);

    case "server":
      return "Papert is having trouble right now. Try again in a moment.";

    default:
      return "Something went wrong. Try again.";
  }
}
