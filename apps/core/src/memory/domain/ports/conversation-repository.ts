import type { Conversation } from '../memory.js';

export interface ConversationRepository {
  // Most recently active first.
  list(
    userId: string,
    workspaceId: string,
    limit: number,
  ): Promise<Conversation[]>;
  create(userId: string, workspaceId: string, now: Date): Promise<Conversation>;
}
