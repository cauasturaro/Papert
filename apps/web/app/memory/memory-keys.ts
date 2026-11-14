// Every memory query key starts here, so one invalidation refreshes the page and the tutor panel.
export const MEMORY_KEY = "memory";

export const ITEMS_KEY = [MEMORY_KEY, "items"];

export function conversationsKey(workspaceId: string) {
  return [MEMORY_KEY, "conversations", workspaceId];
}
