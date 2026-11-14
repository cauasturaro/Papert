import type { Prisma } from '@prisma/client';

type Transaction = Prisma.TransactionClient;

/** Serializes every change to one learner's durable items, including Seymour's proposals. */
export async function lockLearner(tx: Transaction, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`memory:${userId}`}, 0))`;
}

/** Proposals the learner did not review in time are removed, not kept as history. */
export async function purgeExpired(tx: Transaction, userId: string, now: Date) {
  await tx.memoryItem.deleteMany({
    where: { userId, expiresAt: { lte: now } },
  });
}
