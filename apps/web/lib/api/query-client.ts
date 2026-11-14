import { QueryClient } from "@tanstack/react-query";
import { isRetryable, retryAfterMs } from "./learner-error.ts";

const MAX_QUERY_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 30_000;

/** Retries only failures that may succeed when sent again; 4xx answers are final. */
export function shouldRetryQuery(failureCount: number, error: unknown) {
  return failureCount < MAX_QUERY_RETRIES && isRetryable(error);
}

/** Honors the server's Retry-After, otherwise backs off exponentially. */
export function queryRetryDelay(failureCount: number, error: unknown) {
  const serverWait = retryAfterMs(error);
  const backoff = 1000 * 2 ** failureCount;

  return Math.min(serverWait ?? backoff, MAX_RETRY_DELAY_MS);
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        retryDelay: queryRetryDelay,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

let browserClient: QueryClient | undefined;

/**
 * One client per browser tab, so code outside React (sign-out) reaches the same cache.
 * Server renders get a fresh client each time and never share data between requests.
 */
export function getQueryClient() {
  if (typeof window === "undefined") {
    return createQueryClient();
  }

  browserClient ??= createQueryClient();

  return browserClient;
}
