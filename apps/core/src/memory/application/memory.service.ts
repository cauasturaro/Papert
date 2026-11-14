import { cursorPageSchema } from '../../common/application/contracts/cursor-page.contract.js';
import { z } from 'zod';
import type { Clock } from '../../common/domain/runtime.js';
import {
  CONVERSATION_LIST_LIMIT,
  conversationTitle,
} from '../domain/conversation.js';
import {
  acceptChange,
  createChange,
  removeChange,
  updateChange,
} from '../domain/durable-memory.js';
import { MemoryError } from '../domain/memory.js';
import type { ConversationRepository } from '../domain/ports/conversation-repository.js';
import type { MemoryRepository } from '../domain/ports/memory-repository.js';
import type { MemoryWorkspaces } from '../domain/ports/memory-workspaces.js';
import {
  createItemSchema,
  emptyBodySchema,
  parse,
  renameConversationSchema,
  updateItemSchema,
} from './contracts/memory.contract.js';
import { conversationView, memoryItemView } from './memory-presentation.js';

/** Learner-facing memory: durable items (L3) and the conversations (L2) of a workspace. */
export class MemoryService {
  constructor(
    private readonly items: MemoryRepository,
    private readonly conversations: ConversationRepository,
    private readonly workspaces: MemoryWorkspaces,
    private readonly clock: Clock,
  ) {}

  async list(userId: string) {
    const items = await this.items.list(userId, this.clock());

    return items.map(memoryItemView);
  }

  async create(userId: string, body: unknown) {
    const input = parse(createItemSchema, body);

    const item = await this.items.write(userId, this.clock(), (current) =>
      createChange(current, input),
    );

    return memoryItemView(item);
  }

  async update(userId: string, id: string, body: unknown) {
    const input = parse(updateItemSchema, body);

    const item = await this.items.write(userId, this.clock(), (current) =>
      updateChange(current, id, input),
    );

    return memoryItemView(item);
  }

  async accept(userId: string, id: string, body: unknown) {
    parse(emptyBodySchema, body);

    const item = await this.items.write(userId, this.clock(), (current) =>
      acceptChange(current, id),
    );

    return memoryItemView(item);
  }

  async remove(userId: string, id: string, body: unknown) {
    parse(emptyBodySchema, body);

    await this.items.remove(userId, this.clock(), (current) =>
      removeChange(current, id),
    );
  }

  /** The given items that are still active; executions checks them again before a worker runs. */
  activeIds(userId: string, ids: string[]) {
    return this.items.activeIds(userId, ids);
  }

  async conversationPage(userId: string, workspaceId: string, query: unknown) {
    const page = parse(
      cursorPageSchema.extend({ cursor: z.guid().optional() }),
      query,
    );

    await this.assertOwned(userId, workspaceId);

    const rows = await this.conversations.list(
      userId,
      workspaceId,
      page.limit + 1,
      page.cursor,
    );

    const items = rows.slice(0, page.limit).map(conversationView);

    return {
      items,
      nextCursor: rows.length > page.limit ? items[items.length - 1].id : null,
    };
  }

  async conversationsOf(userId: string, workspaceId: string) {
    await this.assertOwned(userId, workspaceId);

    const conversations = await this.conversations.list(
      userId,
      workspaceId,
      CONVERSATION_LIST_LIMIT,
    );

    return conversations.map(conversationView);
  }

  /**
   * A new conversation starts empty; durable memory and the workspace carry over. An existing
   * conversation without any request is reused, so repeated clicks do not pile up empty entries.
   */
  async startConversation(userId: string, workspaceId: string, body: unknown) {
    parse(emptyBodySchema, body);

    await this.assertOwned(userId, workspaceId);

    const empty = await this.conversations.latestEmpty(userId, workspaceId);
    if (empty) {
      return conversationView(empty);
    }

    const conversation = await this.conversations.create(
      userId,
      workspaceId,
      this.clock(),
    );

    return conversationView(conversation);
  }

  async renameConversation(
    userId: string,
    workspaceId: string,
    id: string,
    body: unknown,
  ) {
    const input = parse(renameConversationSchema, body);
    const title = conversationTitle(input.title);
    if (!title) {
      throw new MemoryError('invalid', 'Give the conversation a name.');
    }

    await this.assertOwned(userId, workspaceId);

    const conversation = await this.conversations.rename(
      userId,
      workspaceId,
      id,
      title,
    );
    if (!conversation) {
      throw new MemoryError('not_found', 'Conversation not found.');
    }

    return conversationView(conversation);
  }

  /** Deletes the conversation and its messages; durable memory is kept. */
  async removeConversation(
    userId: string,
    workspaceId: string,
    id: string,
    body: unknown,
  ) {
    parse(emptyBodySchema, body);

    await this.assertOwned(userId, workspaceId);

    const removal = await this.conversations.remove(userId, workspaceId, id);
    if (removal === 'not_found') {
      throw new MemoryError('not_found', 'Conversation not found.');
    }

    if (removal === 'active') {
      throw new MemoryError(
        'conflict',
        'Seymour is still answering in this conversation. Stop the answer or wait, then delete it.',
      );
    }
  }

  private async assertOwned(userId: string, workspaceId: string) {
    const owned = await this.workspaces.owns(userId, workspaceId);

    if (!owned) {
      throw new MemoryError('not_found', 'Workspace not found.');
    }
  }
}
