import type { Prisma } from '@prisma/client';
import {
  assertRateLimit,
  rateWindowStart,
  rateLimitWait,
} from '../domain/admission/admission.js';
import { RATE_LIMIT } from '../domain/admission/quota.js';

export async function assertExecutionRateLimit(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
) {
  const window = { userId, createdAt: { gte: rateWindowStart(now) } };
  const recent = await tx.execution.count({ where: window });
  if (recent >= RATE_LIMIT) {
    const oldest = await tx.execution.findFirst({
      where: window,
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    assertRateLimit(recent, rateLimitWait(oldest?.createdAt ?? null, now));
  }
}
