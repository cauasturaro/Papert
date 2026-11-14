import type { Prisma } from '@prisma/client';
import { toProfile } from './engagement-rows.js';

/** Creates the learner's profile when missing and locks it for the rest of the transaction. */
export async function lockProfile(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  await tx.$executeRaw`
    INSERT INTO core.learner_profile (user_id) VALUES (${userId}::uuid)
    ON CONFLICT (user_id) DO NOTHING`;

  await tx.$queryRaw`SELECT user_id FROM core.learner_profile WHERE user_id = ${userId}::uuid FOR UPDATE`;

  const row = await tx.learnerProfile.findUniqueOrThrow({ where: { userId } });

  return toProfile(row);
}
