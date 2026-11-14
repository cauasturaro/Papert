import type { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import { PrismaPublicationRepository } from './prisma-publication-repository.js';

it('shares concurrent vocabulary reads, expires the cache and invalidates after publication', async () => {
  const query = vi.fn().mockResolvedValue([{ word: 'ports', documents: 3 }]);
  const insert = vi.fn().mockResolvedValue(1);
  const repository = new PrismaPublicationRepository({
    $queryRaw: query,
    $executeRaw: insert,
  } as unknown as PrismaService);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(0);

  try {
    await Promise.all([repository.vocabulary(), repository.vocabulary()]);
    expect(query).toHaveBeenCalledTimes(1);

    clock.mockReturnValue(60_001);
    await repository.vocabulary();
    expect(query).toHaveBeenCalledTimes(2);

    await repository.publishMany([
      {
        roadmapId: 'ports',
        publishedByUserId: null,
        authorName: 'Papert',
        level: 'beginner',
        search: { title: 'Ports', topics: 'Ports', description: 'Ports' },
      },
    ]);
    await repository.vocabulary();

    expect(query).toHaveBeenCalledTimes(3);
  } finally {
    clock.mockRestore();
  }
});
