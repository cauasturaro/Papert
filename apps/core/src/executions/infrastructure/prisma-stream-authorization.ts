import { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import type { StreamAuthorization } from '../domain/ports/stream-authorization.js';
import type { StreamConnection } from '../domain/stream.js';

export class PrismaStreamAuthorization implements StreamAuthorization {
  constructor(private readonly db: PrismaService) {}

  async execution(id: string) {
    const job = await this.db.execution.findUniqueOrThrow({
      where: { id },
      include: { workspace: { include: { session: true } } },
    });

    return {
      id: job.id,
      userId: job.userId,
      sessionId: job.workspace.session!.id,
    };
  }

  async liveSession(connection: StreamConnection) {
    const session = await this.db.authSession.findFirst({
      where: {
        id: connection.authSessionId,
        userId: connection.userId,
        tokenId: connection.tokenId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    return !!session;
  }

  async ownsExecution(connection: StreamConnection) {
    const job = await this.db.execution.findFirst({
      where: {
        id: connection.executionId,
        userId: connection.userId,
        workspace: { session: { id: connection.sessionId } },
      },
    });

    return !!job;
  }
}
