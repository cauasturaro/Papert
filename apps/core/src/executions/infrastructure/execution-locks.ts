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
