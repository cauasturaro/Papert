import { parseExecutionMessage } from "./execution-schema.ts";
import type { Execution } from "./execution-state";

/**
 * Socket state of one followed execution: still connecting, open, closed (polling covers
 * it) or not offered by this deployment (polling is the only channel).
 */
export type StreamState = "connecting" | "live" | "down" | "unavailable";

export type StreamSocket = {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string): void;
  close(): void;
};

type Timers = {
  set(callback: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
};

export type StreamOptions = {
  executionId: string;
  requestTicket: (executionId: string) => Promise<{ url: string | null }>;
  createSocket: (url: string) => StreamSocket;
  onSnapshot: (snapshot: Execution) => void;
  // A trimmed frame arrived; only a full HTTP read may advance the sequence.
  onRefreshNeeded: () => void;
  onState: (state: StreamState) => void;
  maxReconnects?: number;
  timers?: Timers;
};

const MAX_RECONNECTS = 5;

const browserTimers: Timers = {
  set: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function reconnectDelay(attempt: number) {
  return Math.min(15_000, 1000 * 2 ** attempt);
}

/**
 * Follows one execution over WebSocket with ticket auth, reconnecting with backoff after a
 * close. Only validated snapshots of this execution reach `onSnapshot`. Returns a stop
 * function. The socket is never the only source of truth: the caller keeps reading the
 * persisted snapshot over HTTP, because a terminal push can be lost while the socket
 * stays open.
 */
export function openExecutionStream({
  executionId,
  requestTicket,
  createSocket,
  onSnapshot,
  onRefreshNeeded,
  onState,
  maxReconnects = MAX_RECONNECTS,
  timers = browserTimers,
}: StreamOptions) {
  let stopped = false;
  let socket: StreamSocket | null = null;
  let reconnectTimer: unknown = null;
  let reconnects = 0;

  function scheduleReconnect() {
    if (stopped) {
      return;
    }

    socket = null;
    onState("down");
    reconnects += 1;

    if (reconnects > maxReconnects) {
      return;
    }

    reconnectTimer = timers.set(
      () => void connect(),
      reconnectDelay(reconnects),
    );
  }

  async function connect() {
    let ticket: { url: string | null };

    try {
      ticket = await requestTicket(executionId);
    } catch {
      scheduleReconnect();

      return;
    }

    if (stopped) {
      return;
    }

    // Without a streaming endpoint (local development) polling is the only channel.
    if (!ticket.url) {
      onState("unavailable");

      return;
    }

    const opened = createSocket(ticket.url);
    socket = opened;

    opened.onopen = () => {
      reconnects = 0;
      onState("live");
      opened.send(JSON.stringify({ action: "resume" }));
    };

    opened.onmessage = (event) => {
      const message = parseExecutionMessage(event.data, executionId);

      if (stopped || !message) {
        return;
      }

      // Applying a trimmed frame would make the full snapshot with the same sequence look
      // stale, and its sources would never arrive.
      if (message.requiresRefresh) {
        onRefreshNeeded();
        return;
      }

      onSnapshot(message.snapshot);
    };

    opened.onclose = () => scheduleReconnect();
  }

  onState("connecting");
  void connect();

  return () => {
    stopped = true;
    timers.clear(reconnectTimer);

    if (socket) {
      socket.onclose = null;
      socket.close();
    }
  };
}
