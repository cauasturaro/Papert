import type { AttemptStore } from '../domain/auth.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';

export class PrismaAttemptStore implements AttemptStore {
  constructor(private readonly db: PrismaService) {}

  async consumeAttempt(key: string, limit: number) {
    const [row] = await this.db.$queryRaw<{ count: number }[]>`
      INSERT INTO core.auth_attempt (key, count, resets_at)
      VALUES (${key}, 1, now() + interval '15 minutes')
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
          WHEN auth_attempt.resets_at <= now() THEN 1
          ELSE LEAST(auth_attempt.count + 1, 1000)
        END,
        resets_at = CASE
          WHEN auth_attempt.resets_at <= now() THEN now() + interval '15 minutes'
          ELSE auth_attempt.resets_at
        END
      RETURNING count`;

    return row.count <= limit;
  }
}
