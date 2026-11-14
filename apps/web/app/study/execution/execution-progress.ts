import type { Query } from "@tanstack/react-query";
import { isRunning, newerSnapshot, type Execution } from "./execution-state.ts";
import type { StreamState } from "./execution-stream.ts";
import { studyKeys } from "../study-keys.ts";

/** How the followed answer reaches the panel: live socket, HTTP polling, or neither. */
export type Connection = "live" | "polling" | "lost";

export const FIRST_POLL_MS = 1500;
export const MAX_POLL_MS = 10_000;

// While the socket is open, HTTP still reads the persisted snapshot now and then: a final
// push can be lost, or never sent when Core times the execution out.
export const RECONCILE_MS = 15_000;

/** Keeps the snapshot with the higher sequence of the same execution. */
export function keepNewer<T extends Execution>(
  current: T | undefined,
  incoming: T,
): T {
  if (!current) {
    return incoming;
  }

  return (newerSnapshot(current, incoming) as T | null) ?? incoming;
}

/**
 * Delay before the next HTTP read of a followed execution: none once it settled, the slow
 * reconciliation interval while the socket is live, otherwise a backoff from 1.5 s up to
 * `maxPollMs`.
 */
export function nextReadDelay(
  snapshot: Execution | undefined,
  stream: StreamState,
  reads: number,
  maxPollMs = MAX_POLL_MS,
): number | false {
  if (snapshot && !isRunning(snapshot)) {
    return false;
  }

  if (stream === "live") {
    return RECONCILE_MS;
  }

  return Math.min(maxPollMs, FIRST_POLL_MS * 1.5 ** reads);
}

/** What the panel shows about the channel; "lost" only once reads keep failing too. */
export function connectionOf(
  stream: StreamState,
  readsFailing: boolean,
): Connection {
  if (stream === "live" || stream === "connecting") {
    return "live";
  }

  return readsFailing ? "lost" : "polling";
}

/**
 * Query options of a followed execution. HTTP reads continue while a socket is open, at
 * the reconciliation interval, and stop once the snapshot settles.
 */
export function executionQueryOptions<T extends Execution>(
  executionId: string,
  read: (executionId: string) => Promise<T>,
  stream: StreamState,
  maxPollMs = MAX_POLL_MS,
) {
  return {
    queryKey: studyKeys.execution(executionId),
    queryFn: () => read(executionId),
    structuralSharing: (current: unknown, incoming: unknown) =>
      keepNewer(current as T | undefined, incoming as T),
    refetchInterval: (query: Query<T, Error, T, readonly unknown[]>) =>
      nextReadDelay(
        query.state.data,
        stream,
        query.state.dataUpdateCount,
        maxPollMs,
      ),
    refetchOnWindowFocus: (query: Query<T, Error, T, readonly unknown[]>) =>
      isRunning(query.state.data ?? null),
  };
}
