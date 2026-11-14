import { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import type { VoteValue } from '../domain/community.js';
import { toVote, voteChange } from '../domain/ranking.js';
import type { VoteRepository } from '../domain/ports/vote-repository.js';
import { PUBLICATION_SELECT, publication } from './publication-row.js';
import type { StoredPublication } from './publication-row.js';

export class PrismaVoteRepository implements VoteRepository {
  constructor(private readonly db: PrismaService) {}

  async vote(userId: string, roadmapId: string, value: VoteValue) {
    return this.db.$transaction(async (tx) => {
      // Votes on one roadmap apply one at a time, so counters always match the vote rows.
      const rows = await tx.$queryRaw<StoredPublication[]>`
        SELECT ${PUBLICATION_SELECT}
        FROM core.roadmap_publication
        WHERE roadmap_id = ${roadmapId}
        FOR UPDATE
      `;
      if (rows.length === 0) {
        return null;
      }

      const current = publication(rows[0]);

      const existing = await tx.roadmapVote.findUnique({
        where: { userId_roadmapId: { userId, roadmapId } },
      });
      const previous = toVote(existing?.value);

      const tally = voteChange(current, previous, value);

      if (previous === value) {
        return tally;
      }

      if (value === 0) {
        await tx.roadmapVote.delete({
          where: { userId_roadmapId: { userId, roadmapId } },
        });
      } else {
        await tx.roadmapVote.upsert({
          where: { userId_roadmapId: { userId, roadmapId } },
          create: { userId, roadmapId, value },
          update: { value, updatedAt: new Date() },
        });
      }

      await tx.roadmapPublication.update({
        where: { roadmapId },
        data: tally,
      });

      return tally;
    });
  }

  async votesOf(userId: string, roadmapIds: string[]) {
    const rows = await this.db.roadmapVote.findMany({
      where: { userId, roadmapId: { in: roadmapIds } },
    });

    return new Map(rows.map((row) => [row.roadmapId, toVote(row.value)]));
  }
}
