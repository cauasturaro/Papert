import type { Clock } from '../../common/domain/runtime.js';
import { CONVERSATION_LIST_LIMIT } from '../domain/conversation.js';
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

  async conversationsOf(userId: string, workspaceId: string) {
    await this.assertOwned(userId, workspaceId);

    const conversations = await this.conversations.list(
      userId,
      workspaceId,
      CONVERSATION_LIST_LIMIT,
    );

    return conversations.map(conversationView);
  }

  /** A new conversation starts empty; durable memory and the workspace carry over. */
  async startConversation(userId: string, workspaceId: string, body: unknown) {
    parse(emptyBodySchema, body);

    await this.assertOwned(userId, workspaceId);

    const conversation = await this.conversations.create(
      userId,
      workspaceId,
      this.clock(),
    );

    return conversationView(conversation);
  }

  private async assertOwned(userId: string, workspaceId: string) {
    const owned = await this.workspaces.owns(userId, workspaceId);

    if (!owned) {
      throw new MemoryError('not_found', 'Workspace not found.');
    }
  }
}
