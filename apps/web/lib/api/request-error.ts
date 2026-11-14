export type RequestErrorKind =
  | "network"
  | "session_expired"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "rate_limited"
  | "quota_exhausted"
  | "server"
  | "unknown";

export type RequestErrorDetails = {
  kind?: RequestErrorKind;
  // The server's own message when it reads as plain language, otherwise null.
  serverMessage?: string | null;
  retryAfterMs?: number | null;
  // Epoch milliseconds when a daily quota resets.
  resetsAt?: number | null;
};

/** A failed API call with the HTTP status (0 when no response arrived) and a message safe to show the learner. */
export class RequestError extends Error {
  readonly status: number;
  readonly kind: RequestErrorKind;
  readonly serverMessage: string | null;
  readonly retryAfterMs: number | null;
  readonly resetsAt: number | null;

  constructor(
    status: number,
    message: string,
    details: RequestErrorDetails = {},
  ) {
    super(message);

    this.name = "RequestError";
    this.status = status;
    this.kind = details.kind ?? kindForStatus(status);
    this.serverMessage = details.serverMessage ?? null;
    this.retryAfterMs = details.retryAfterMs ?? null;
    this.resetsAt = details.resetsAt ?? null;
  }
}

export function kindForStatus(status: number): RequestErrorKind {
  if (status === 0) {
    return "network";
  }

  if (status === 401) {
    return "session_expired";
  }

  if (status === 403) {
    return "forbidden";
  }

  if (status === 404) {
    return "not_found";
  }

  if (status === 409) {
    return "conflict";
  }

  if (status === 400 || status === 422) {
    return "validation";
  }

  if (status === 429) {
    return "rate_limited";
  }

  if (status >= 500) {
    return "server";
  }

  return "unknown";
}

// Browsers word fetch failures differently: Chrome "Failed to fetch", Firefox
// "NetworkError when attempting to fetch resource.", Safari "Load failed".
export function isNetworkFailure(error: unknown) {
  if (!(error instanceof TypeError)) {
    return false;
  }

  return /fetch|network|load failed/i.test(error.message);
}

const TECHNICAL_WORDS =
  /\b(exception|stack|undefined|null|prisma|jwt|jwe|token|uuid|ECONN\w*|ETIMEDOUT|errno|sql|json|internal server error|bad gateway|unexpected)\b/i;

/** Whether a server message can be shown as is: one short plain-language sentence or two. */
export function isReadableMessage(message: unknown): message is string {
  if (typeof message !== "string") {
    return false;
  }

  const text = message.trim();

  if (text.length < 3 || text.length > 240) {
    return false;
  }

  if (/^[[{<]/.test(text) || /\n|\s{3,}|=>|::|\w+\.\w+\(/.test(text)) {
    return false;
  }

  return !TECHNICAL_WORDS.test(text);
}

/** Retry-After as delta seconds or an HTTP date; null when absent or invalid. */
export function parseRetryAfter(value: string | null, now = Date.now()) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }

  const date = Date.parse(trimmed);

  if (Number.isNaN(date)) {
    return null;
  }

  return Math.max(0, date - now);
}

// Core words quota errors as "... daily token quota ... It resets on 2026-11-07 at 00:00 UTC."
const QUOTA_MESSAGE = /\bquota\b/i;
const QUOTA_RESET = /resets on (\d{4})-(\d{2})-(\d{2}) at (\d{2}):(\d{2}) UTC/i;
const RETRY_IN = /retry in (one|a|\d+) (second|minute)s?/i;

function resetFromBody(body: Record<string, unknown>) {
  const value = body.resetsAt;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const date = Date.parse(value);

    return Number.isNaN(date) ? null : date;
  }

  return null;
}

function resetFromMessage(message: string) {
  const match = QUOTA_RESET.exec(message);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute] = match.map(Number);

  return Date.UTC(year, month - 1, day, hour, minute);
}

function retryFromMessage(message: string) {
  const match = RETRY_IN.exec(message);

  if (!match) {
    return null;
  }

  const amount = /^\d+$/.test(match[1]) ? Number(match[1]) : 1;
  const unitMs = match[2].toLowerCase() === "minute" ? 60_000 : 1000;

  return amount * unitMs;
}

type ErrorBody = Record<string, unknown> | null;

/**
 * Builds the error for a failed response. `message` keeps the caller's legacy copy;
 * `details` carries what `toLearnerMessage` and retry logic need.
 */
export function describeFailure(
  response: Pick<Response, "status" | "headers">,
  body: ErrorBody,
  now = Date.now(),
): Required<RequestErrorDetails> {
  const rawMessage = typeof body?.message === "string" ? body.message : "";
  const serverMessage = isReadableMessage(rawMessage)
    ? rawMessage.trim()
    : null;
  let kind = kindForStatus(response.status);
  let retryAfterMs = parseRetryAfter(response.headers.get("retry-after"), now);
  let resetsAt: number | null = null;

  if (kind === "rate_limited" && QUOTA_MESSAGE.test(rawMessage)) {
    kind = "quota_exhausted";
    resetsAt = (body && resetFromBody(body)) ?? resetFromMessage(rawMessage);
  }

  if (kind === "rate_limited" && retryAfterMs === null) {
    retryAfterMs = retryFromMessage(rawMessage);
  }

  return { kind, serverMessage, retryAfterMs, resetsAt };
}

/** Reads a JSON error body; proxies and gateways may answer with an empty or non-JSON body. */
export async function readErrorBody(response: Response): Promise<ErrorBody> {
  try {
    const data = await response.json();

    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}
