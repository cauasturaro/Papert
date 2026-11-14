import { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import type { LibraryRepository } from '../domain/ports/library-repository.js';

/** Saved roadmaps are references to the publication, never copies of the roadmap. */
export class PrismaLibraryRepository implements LibraryRepository {
  constructor(private readonly db: PrismaService) {}

  async add(userId: string, roadmapId: string) {
    await this.db.libraryEntry.createMany({
      data: { userId, roadmapId },
      skipDuplicates: true,
    });
  }

  async remove(userId: string, roadmapId: string) {
    await this.db.libraryEntry.deleteMany({ where: { userId, roadmapId } });
  }

  async list(userId: string, limit: number, cursor?: string) {
    const rows = await this.db.libraryEntry.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { roadmapId: 'desc' }],
      select: { roadmapId: true },
      take: limit,
      ...(cursor
        ? {
            cursor: { userId_roadmapId: { userId, roadmapId: cursor } },
            skip: 1,
          }
        : {}),
    });

    return rows.map((row) => row.roadmapId);
  }

  async favoritesOf(userId: string, roadmapIds: string[]) {
    const rows = await this.db.libraryEntry.findMany({
      where: { userId, roadmapId: { in: roadmapIds } },
      select: { roadmapId: true },
    });

    return new Set(rows.map((row) => row.roadmapId));
  }
}
