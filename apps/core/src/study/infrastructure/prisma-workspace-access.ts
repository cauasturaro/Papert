import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import type { ProgressionTransaction } from '../domain/attempt-progression.js';
import type { WorkspaceAccess } from '../domain/ports/workspace-access.js';

export class PrismaWorkspaceAccess implements WorkspaceAccess {
  constructor(private readonly db: PrismaService) {}

  async lock(
    context: ProgressionTransaction,
    userId: string,
    workspaceId: string,
  ) {
    const tx = context as Prisma.TransactionClient;

    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM core.workspace
      WHERE id = ${workspaceId}::uuid AND user_id = ${userId}::uuid
      FOR UPDATE`;
    if (!locked.length) {
      return null;
    }

    const workspace = await tx.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      include: { roadmap: true, session: true },
    });

    return {
      revision: workspace.revision,
      files: workspace.files as Record<string, string>,
      currentStep: workspace.currentStep,
      roadmap: workspace.roadmap,
      sessionId: workspace.session?.id ?? null,
    };
  }

  async saved(userId: string, workspaceId: string) {
    const workspace = await this.db.workspace.findFirst({
      where: { id: workspaceId, userId },
      select: { revision: true, files: true },
    });
    if (!workspace) {
      return null;
    }

    return {
      revision: workspace.revision,
      files: workspace.files as Record<string, string>,
    };
  }

  async owns(userId: string, workspaceId: string) {
    const workspace = await this.db.workspace.findFirst({
      where: { id: workspaceId, userId },
      select: { id: true },
    });

    return !!workspace;
  }
}
