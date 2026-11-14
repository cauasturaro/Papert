type TabMessage =
  | { type: "hello" | "here" | "bye"; tabId: string }
  | { type: "saved"; tabId: string; revision: number };

export type TabChannel = {
  postMessage(message: TabMessage): void;
  onmessage: ((event: MessageEvent) => void) | null;
  close(): void;
};

type Options = {
  channel: TabChannel;
  tabId: string;
  onOthersChange: (others: string[]) => void;
  onSavedElsewhere: (revision: number) => void;
};

function isTabMessage(value: unknown): value is TabMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Record<string, unknown>;

  if (typeof message.tabId !== "string") {
    return false;
  }

  if (message.type === "saved") {
    return typeof message.revision === "number";
  }

  return ["hello", "here", "bye"].includes(message.type as string);
}

/**
 * Presence of this tab among the others showing the same workspace: a new tab says hello,
 * open tabs answer, a closing tab says bye, and saves are announced so other tabs can
 * follow the new revision. Returns the announce and leave actions.
 */
export function joinTabPresence({
  channel,
  tabId,
  onOthersChange,
  onSavedElsewhere,
}: Options) {
  let others: string[] = [];

  function update(next: string[]) {
    others = next;
    onOthersChange(others);
  }

  channel.onmessage = (event) => {
    const message: unknown = event.data;

    if (!isTabMessage(message) || message.tabId === tabId) {
      return;
    }

    if (message.type === "hello") {
      if (!others.includes(message.tabId)) {
        update([...others, message.tabId]);
      }

      channel.postMessage({ type: "here", tabId });
    } else if (message.type === "here") {
      if (!others.includes(message.tabId)) {
        update([...others, message.tabId]);
      }
    } else if (message.type === "bye") {
      update(others.filter((entry) => entry !== message.tabId));
    } else if (message.type === "saved") {
      onSavedElsewhere(message.revision);
    }
  };

  channel.postMessage({ type: "hello", tabId });

  return {
    announceSaved(revision: number) {
      channel.postMessage({ type: "saved", tabId, revision });
    },
    leave() {
      channel.postMessage({ type: "bye", tabId });
    },
  };
}
