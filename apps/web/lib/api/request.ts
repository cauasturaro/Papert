import { AuthRequestError, checkSession } from "../auth/auth-api.ts";
import { renewSession } from "../auth/session-renewal.ts";
import { reportUnauthorized } from "../auth/session-signal.ts";
import {
  describeFailure,
  isNetworkFailure,
  readErrorBody,
  RequestError,
} from "./request-error.ts";

export { RequestError } from "./request-error.ts";
export type { RequestErrorKind } from "./request-error.ts";

type JsonApi = {
  // Same-origin proxy prefix, such as "/api/study".
  base: string;
  unauthorized: string;
  unavailable: string;
  // Copy for requests that never reached the server.
  offline?: string;
};

const OFFLINE_MESSAGE =
  "You appear to be offline. Check your connection and try again.";

/**
 * `fetch` that rejects with a network `RequestError` instead of the browser's raw
 * TypeError. Aborts are rethrown unchanged.
 */
export async function fetchOrOffline(
  input: RequestInfo | URL,
  init?: RequestInit,
  offline = OFFLINE_MESSAGE,
) {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (isNetworkFailure(error)) {
      throw new RequestError(0, offline, { kind: "network" });
    }

    throw error;
  }
}

/**
 * Turns a failed authenticated response into a `RequestError`: 401 uses `unauthorized`
 * and signals an expired session, other statuses keep the server's message or `unavailable`.
 */
export async function failedResponseError(
  response: Response,
  { unauthorized, unavailable }: Pick<JsonApi, "unauthorized" | "unavailable">,
) {
  const body = await readErrorBody(response);
  const details = describeFailure(response, body);

  if (response.status === 401) {
    reportUnauthorized();

    return new RequestError(401, unauthorized, details);
  }

  const message =
    typeof body?.message === "string" ? body.message : unavailable;

  return new RequestError(response.status, message, details);
}

/**
 * Renews an expired access token with the refresh cookie, coordinated across tabs.
 * Resolves false when the session itself is gone.
 */
async function renewAccess() {
  try {
    await renewSession(
      () => checkSession(true),
      () => checkSession(false),
    );

    return true;
  } catch (error) {
    if (error instanceof AuthRequestError && error.status === 401) {
      return false;
    }

    throw error;
  }
}

/**
 * JSON request helper for one proxied API; 204 resolves to undefined. A 401 renews the
 * session once and retries, so an access token that expired while the tab was idle does
 * not fail an autosave or a click.
 */
export function createJsonRequest({
  base,
  unauthorized,
  unavailable,
  offline = OFFLINE_MESSAGE,
}: JsonApi) {
  return async function requestJson<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      cache: "no-store",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    };

    const url = `${base}/${path}`;
    let response = await fetchOrOffline(url, init, offline);

    if (response.status === 401 && (await renewAccess())) {
      response = await fetchOrOffline(url, init, offline);
    }

    if (!response.ok) {
      throw await failedResponseError(response, { unauthorized, unavailable });
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  };
}
