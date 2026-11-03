export type Execution = {
  id: string;
  workspaceId: string;
  kind: "chat" | "analysis";
  prompt: string | null;
  status: string;
  text: string;
  sequence: number;
  charged: number;
  reserved: number;
};

export function newerSnapshot(
  current: Execution | null,
  incoming: Execution,
): Execution | null {
  if (
    current &&
    (current.id !== incoming.id || incoming.sequence <= current.sequence)
  ) {
    return current;
  }

  return incoming;
}

export function isRunning(execution: Execution | null) {
  return !!execution && ["queued", "running"].includes(execution.status);
}
