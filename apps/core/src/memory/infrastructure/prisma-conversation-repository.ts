import { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import type {
  ConversationRemoval,
  ConversationRepository,
} from '../domain/ports/conversation-repository.js';
import { toConversation } from './memory-rows.js';

const ACTIVE_STATUSES = ['queued', 'running'];

/** Callers check workspace ownership through MemoryWorkspaces first. */
export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly db: PrismaService) {}

  async list(
    userId: string,
    workspaceId: string,
    limit: number,
    cursor?: string,
  ) {
    const rows = await this.db.tutorConversation.findMany({
      where: { userId, workspaceId },
      orderBy: [{ lastActiveAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    return rows.map(toConversation);
  }

  async create(userId: string, workspaceId: string, now: Date) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM core.workspace
        WHERE id = ${workspaceId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;

      const empty = await tx.tutorConversation.findFirst({
        where: { userId, workspaceId, executions: { none: {} } },
        orderBy: [{ lastActiveAt: 'desc' }, { id: 'desc' }],
      });
      if (empty) {
        return toConversation(empty);
      }

      const row = await tx.tutorConversation.create({
        data: { userId, workspaceId, createdAt: now, lastActiveAt: now },
      });

      return toConversation(row);
    });
  }

  async latestEmpty(userId: string, workspaceId: string) {
    const row = await this.db.tutorConversation.findFirst({
      where: { userId, workspaceId, executions: { none: {} } },
      orderBy: [{ lastActiveAt: 'desc' }, { id: 'desc' }],
    });

    return row ? toConversation(row) : null;
  }

  async rename(userId: string, workspaceId: string, id: string, title: string) {
    const renamed = await this.db.tutorConversation.updateMany({
      where: { id, userId, workspaceId },
      data: { title },
    });

    if (renamed.count === 0) {
      return null;
    }

    const row = await this.db.tutorConversation.findUniqueOrThrow({
      where: { id },
    });

    return toConversation(row);
  }

  /** Deleting cascades to the conversation's executions; the daily quota is stored apart. */
  async remove(
    userId: string,
    workspaceId: string,
    id: string,
  ): Promise<ConversationRemoval> {
    return this.db.$transaction(async (tx) => {
      // Admission locks the same row, so no request can start while this one is deleted.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM core.tutor_conversation
        WHERE id = ${id}::uuid AND user_id = ${userId}::uuid AND workspace_id = ${workspaceId}::uuid
        FOR UPDATE`;
      if (!locked.length) {
        return 'not_found';
      }

      const active = await tx.execution.count({
        where: { conversationId: id, status: { in: ACTIVE_STATUSES } },
      });
      if (active > 0) {
        return 'active';
      }

      await tx.tutorConversation.delete({ where: { id } });

      return 'removed';
    });
  }
}
