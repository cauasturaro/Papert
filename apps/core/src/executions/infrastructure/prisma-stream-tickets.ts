import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import type { StreamTickets } from '../domain/ports/stream-tickets.js';
import type { StreamGrant } from '../domain/stream.js';

const hash = (ticket: string) =>
  createHash('sha256').update(ticket).digest('hex');

export class PrismaStreamTickets implements StreamTickets {
  constructor(private readonly db: PrismaService) {}

  generate() {
    return randomBytes(32).toString('base64url');
  }

  async replace(ticket: string, grant: StreamGrant, lifetimeMs: number) {
    await this.db.$transaction(async (tx) => {
      await tx.streamTicket.deleteMany({
        where: {
          executionId: grant.executionId,
          authSessionId: grant.authSessionId,
        },
      });
      await tx.streamTicket.create({
        data: {
          hash: hash(ticket),
          ...grant,
          expiresAt: new Date(Date.now() + lifetimeMs),
        },
      });
    });
  }

  async consume(ticket: string) {
    const tickets = await this.db.$queryRaw<
      {
        execution_id: string;
        auth_session_id: string;
        token_id: string;
      }[]
    >`DELETE FROM core.stream_ticket WHERE hash = ${hash(ticket)}
      AND expires_at > CURRENT_TIMESTAMP
      RETURNING execution_id, auth_session_id, token_id`;
    const grant = tickets[0];
    if (!grant) {
      return null;
    }

    return {
      executionId: grant.execution_id,
      authSessionId: grant.auth_session_id,
      tokenId: grant.token_id,
    };
  }
}
