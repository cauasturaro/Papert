import type { Prisma } from '@prisma/client';
import { assertExecutionRateLimit } from './execution-rate-limit.js';

it('reports the remaining wait from the oldest execution', async () => {
  const now = new Date('2026-11-03T12:00:30Z');
  const execution = {
    count: vi.fn().mockResolvedValue(10),
    findFirst: vi
      .fn()
      .mockResolvedValue({ createdAt: new Date('2026-11-03T12:00:00Z') }),
  };
  const tx = { execution } as unknown as Prisma.TransactionClient;

  const result = assertExecutionRateLimit(tx, 'user', now);

  await expect(result).rejects.toMatchObject({
    kind: 'rate_limited',
    retryAfterSeconds: 30,
  });
  expect(execution.findFirst).toHaveBeenCalledWith({
    where: {
      userId: 'user',
      createdAt: { gte: new Date('2026-11-03T11:59:30Z') },
    },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
});

it('does not fetch the oldest execution below the limit', async () => {
  const execution = { count: vi.fn().mockResolvedValue(9), findFirst: vi.fn() };
  const tx = { execution } as unknown as Prisma.TransactionClient;

  await assertExecutionRateLimit(tx, 'user', new Date());

  expect(execution.findFirst).not.toHaveBeenCalled();
});
