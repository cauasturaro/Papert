import type { Conversation } from '../memory.js';

export interface ConversationRepository {
  // Most recently active first.
  list(
    userId: string,
    workspaceId: string,
    limit: number,
    cursor?: string,
  ): Promise<Conversation[]>;
  create(userId: string, workspaceId: string, now: Date): Promise<Conversation>;
  // The most recently active conversation without any tutor request, if one exists.
  latestEmpty(
    userId: string,
    workspaceId: string,
  ): Promise<Conversation | null>;
  // Null when the conversation is not this learner's in this workspace.
  rename(
    userId: string,
    workspaceId: string,
    id: string,
    title: string,
  ): Promise<Conversation | null>;
  remove(
    userId: string,
    workspaceId: string,
    id: string,
  ): Promise<ConversationRemoval>;
}

/** A conversation with a request still being answered cannot be deleted. */
export type ConversationRemoval = 'removed' | 'not_found' | 'active';
