"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { executionRequest } from "./execution-api";
import {
  connectionOf,
  executionQueryOptions,
  keepNewer,
  type Connection,
} from "./execution-progress";
import { isRunning, type Execution } from "./execution-state";
import { openExecutionStream, type StreamState } from "./execution-stream";
import { studyKeys } from "../study-keys";

type Options<T extends Execution> = {
  // The execution to follow; null when nothing runs.
  executionId: string | null;
  read: (executionId: string) => Promise<T>;
  // Opens the WebSocket stream; HTTP reads continue either way.
  live?: boolean;
  // Pauses HTTP reads; the last snapshot stays available.
  enabled?: boolean;
  maxPollMs?: number;
};

function requestTicket(executionId: string) {
  return executionRequest<{ url: string | null }>(`${executionId}/ticket`, {});
}

/**
 * Follows one execution until it settles. The persisted HTTP snapshot is the source of
 * truth: it is read with backoff while no socket is open and at a slow interval while one
 * is, so a lost final push still settles the turn. Socket snapshots are written into the
 * same query entry, and the higher sequence always wins.
 */
export function useExecutionProgress<T extends Execution>({
  executionId,
  read,
  live = false,
  enabled = true,
  maxPollMs,
}: Options<T>) {
  const queryClient = useQueryClient();
  const [stream, setStream] = useState<{ id: string; state: StreamState }>({
    id: "",
    state: "unavailable",
  });
  const [streamNonce, setStreamNonce] = useState(0);

  let streamState: StreamState = "unavailable";

  if (live && executionId) {
    streamState = stream.id === executionId ? stream.state : "connecting";
  }

  const query = useQuery({
    ...executionQueryOptions(executionId ?? "", read, streamState, maxPollMs),
    enabled: enabled && !!executionId,
  });

  const snapshot = query.data ?? null;
  const running = !snapshot || isRunning(snapshot);
  const streaming = live && enabled && !!executionId && running;

  useEffect(() => {
    if (!streaming || !executionId) {
      return;
    }

    const key = studyKeys.execution(executionId);

    return openExecutionStream({
      executionId,
      requestTicket,
      createSocket: (url) => new WebSocket(url),
      onSnapshot: (incoming) => {
        queryClient.setQueryData<T>(key, (current) =>
          keepNewer(current, incoming as T),
        );
      },
      onRefreshNeeded: () => {
        void queryClient.refetchQueries({ queryKey: key, exact: true });
      },
      onState: (state) => setStream({ id: executionId, state }),
    });
  }, [streaming, executionId, queryClient, streamNonce]);

  const connection: Connection = connectionOf(streamState, query.isError);

  function reconnect() {
    setStreamNonce((value) => value + 1);
    void query.refetch();
  }

  return {
    snapshot,
    error: query.error,
    connection,
    reconnect,
  };
}
