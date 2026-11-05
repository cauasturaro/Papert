/** A failed API call with the HTTP status and a message safe to show the learner. */
export class RequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);

    this.status = status;
  }
}

type JsonApi = {
  // Same-origin proxy prefix, such as "/api/study".
  base: string;
  unauthorized: string;
  unavailable: string;
};

// Proxies and gateways may answer with an empty or non-JSON body.
async function errorMessage(response: Response) {
  try {
    const data = await response.json();

    return typeof data?.message === "string" ? data.message : null;
  } catch {
    return null;
  }
}

/** JSON request helper for one proxied API; 204 resolves to undefined. */
export function createJsonRequest({
  base,
  unauthorized,
  unavailable,
}: JsonApi) {
  return async function requestJson<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${base}/${path}`, {
      method,
      cache: "no-store",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const message =
        response.status === 401
          ? unauthorized
          : ((await errorMessage(response)) ?? unavailable);

      throw new RequestError(response.status, message);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  };
}
