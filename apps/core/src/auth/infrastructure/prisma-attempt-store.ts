import type { AttemptStore } from '../domain/ports/attempt-store.js';
import type { PrismaService } from '../../common/infrastructure/database/prisma.service.js';

export class PrismaAttemptStore implements AttemptStore {
  constructor(private readonly db: PrismaService) {}

  async consumeAttempt(key: string, limit: number, windowSeconds: number) {
    const [row] = await this.db.$queryRaw<{ count: number }[]>`
      INSERT INTO core.auth_attempt (key, count, resets_at)
      VALUES (${key}, 1, now() + (${windowSeconds}::double precision * interval '1 second'))
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
          WHEN auth_attempt.resets_at <= now() THEN 1
          ELSE LEAST(auth_attempt.count + 1, 1000)
        END,
        resets_at = CASE
          WHEN auth_attempt.resets_at <= now() THEN now() + (${windowSeconds}::double precision * interval '1 second')
          ELSE auth_attempt.resets_at
        END
      RETURNING count`;

    return row.count <= limit;
  }

  async releaseAttempt(key: string) {
    await this.db.$executeRaw`
      UPDATE core.auth_attempt
      SET count = GREATEST(count - 1, 0)
      WHERE key = ${key} AND resets_at > now()`;
  }

  async clearAttempts(key: string) {
    await this.db.$executeRaw`DELETE FROM core.auth_attempt WHERE key = ${key}`;
  }
}
