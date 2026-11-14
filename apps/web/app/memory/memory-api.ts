import { createJsonRequest } from "@/lib/api/request";

export type MemoryKind = "preference" | "difficulty";

/** A durable memory: active items reach Seymour; proposals wait for the learner. */
export type MemoryItem = {
  id: string;
  kind: MemoryKind;
  text: string;
  status: "proposed" | "active";
  origin: "learner" | "seymour";
  // The answer that suggested a proposal.
  executionId: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A tutor conversation of one workspace; its summary covers earlier, folded messages. */
export type Conversation = {
  id: string;
  workspaceId: string;
  title: string | null;
  summary: { covered: string[]; pending: string[]; struggles: string[] } | null;
  createdAt: string;
  lastActiveAt: string;
};

// Paths start with "memory" so the item list itself has no trailing slash.
const request = createJsonRequest({
  base: "/api",
  unauthorized: "Sign in to manage what Seymour remembers.",
  unavailable: "Memory is unavailable. Try again.",
});

export function listMemory() {
  return request<MemoryItem[]>("memory");
}

export function createMemory(kind: MemoryKind, text: string) {
  return request<MemoryItem>("memory", "POST", { kind, text });
}

export function updateMemory(
  id: string,
  change: { kind?: MemoryKind; text?: string },
) {
  return request<MemoryItem>(`memory/${id}`, "PATCH", change);
}

export function acceptMemory(id: string) {
  return request<MemoryItem>(`memory/${id}/accept`, "POST", {});
}

// Core requires a JSON body on every mutation (origin/CSRF check).
export function deleteMemory(id: string) {
  return request<void>(`memory/${id}`, "DELETE", {});
}

/** Conversations by most recent activity; `nextCursor` is null on the last page. */
export type ConversationPage = {
  items: Conversation[];
  nextCursor: string | null;
};

const CONVERSATION_PAGE_SIZE = 20;

export function listConversationPage(
  workspaceId: string,
  cursor: string | null,
) {
  const params = new URLSearchParams({
    limit: String(CONVERSATION_PAGE_SIZE),
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  return request<ConversationPage>(
    `memory/workspaces/${workspaceId}/conversations/page?${params}`,
  );
}

export function startConversation(workspaceId: string) {
  return request<Conversation>(
    `memory/workspaces/${workspaceId}/conversations`,
    "POST",
    {},
  );
}

export function renameConversation(
  workspaceId: string,
  conversationId: string,
  title: string,
) {
  return request<Conversation>(
    `memory/workspaces/${workspaceId}/conversations/${conversationId}`,
    "PATCH",
    { title },
  );
}

// Deletes the conversation and its messages; durable memory stays.
export function deleteConversation(
  workspaceId: string,
  conversationId: string,
) {
  return request<void>(
    `memory/workspaces/${workspaceId}/conversations/${conversationId}`,
    "DELETE",
    {},
  );
}
