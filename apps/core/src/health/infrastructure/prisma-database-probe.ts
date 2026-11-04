import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { DatabaseProbe } from '../domain/ports/database-probe.js';

export class PrismaDatabaseProbe implements DatabaseProbe {
  constructor(private readonly db: PrismaService) {}

  async check(): Promise<void> {
    await this.db.$queryRaw`SELECT 1`;
  }
}
