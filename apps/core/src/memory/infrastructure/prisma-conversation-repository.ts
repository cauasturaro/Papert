import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { ConversationRepository } from '../domain/ports/conversation-repository.js';
import { toConversation } from './memory-rows.js';

/** Callers check workspace ownership through MemoryWorkspaces first. */
export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly db: PrismaService) {}

  async list(userId: string, workspaceId: string, limit: number) {
    const rows = await this.db.tutorConversation.findMany({
      where: { userId, workspaceId },
      orderBy: [{ lastActiveAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    return rows.map(toConversation);
  }

  async create(userId: string, workspaceId: string, now: Date) {
    const row = await this.db.tutorConversation.create({
      data: { userId, workspaceId, createdAt: now, lastActiveAt: now },
    });

    return toConversation(row);
  }
}
