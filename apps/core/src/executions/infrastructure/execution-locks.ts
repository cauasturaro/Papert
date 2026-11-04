import type { Prisma } from '@prisma/client';

export async function lockWorkspace(
  tx: Prisma.TransactionClient,
  id: string,
  userId?: string,
) {
  const records = userId
    ? await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM core.workspace WHERE id = ${id}::uuid
        AND user_id = ${userId}::uuid FOR UPDATE`
    : await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM core.workspace WHERE id = ${id}::uuid FOR UPDATE`;

  return records.length > 0;
}

/** Locks the user, then today's quota row, serializing all of a user's admissions. */
export async function lockUserQuota(
  tx: Prisma.TransactionClient,
  userId: string,
  today: string,
) {
  await tx.$queryRaw`SELECT id FROM core.app_user WHERE id = ${userId}::uuid FOR UPDATE`;

  // One quota-row lock serializes reservations across all of a user's workspaces.
  await tx.$executeRaw`
      INSERT INTO core.execution_quota (user_id, period) VALUES (${userId}::uuid, ${today})
      ON CONFLICT (user_id, period) DO NOTHING`;
  const quotas = await tx.$queryRaw<
    { id: string; used: number; reserved: number }[]
  >`
      SELECT id, used, reserved FROM core.execution_quota
      WHERE user_id = ${userId}::uuid AND period = ${today} FOR UPDATE`;

  return quotas[0];
}
