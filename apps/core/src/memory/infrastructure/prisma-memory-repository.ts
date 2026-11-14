import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import { MemoryError } from '../domain/memory.js';
import type { MemoryRepository } from '../domain/ports/memory-repository.js';
import type { MemoryRemoval, MemoryWrite } from '../domain/durable-memory.js';
import type { MemoryItem } from '../domain/memory.js';
import { lockLearner, purgeExpired } from './memory-locks.js';
import { toMemoryItem } from './memory-rows.js';

type Transaction = Prisma.TransactionClient;

export class PrismaMemoryRepository implements MemoryRepository {
  constructor(private readonly db: PrismaService) {}

  async list(userId: string, now: Date) {
    const rows = await this.db.$transaction(async (tx) => {
      await lockLearner(tx, userId);
      await purgeExpired(tx, userId, now);

      return tx.memoryItem.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      });
    });

    return rows.map(toMemoryItem);
  }

  async write(
    userId: string,
    now: Date,
    plan: (items: MemoryItem[]) => MemoryWrite,
  ) {
    try {
      const row = await this.db.$transaction(async (tx) => {
        const items = await this.lockedItems(tx, userId, now);
        const write = plan(items);

        return this.apply(tx, userId, write, now);
      });

      return toMemoryItem(row);
    } catch (error) {
      // The case-insensitive unique index backs the domain's duplicate check.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new MemoryError('conflict', 'Seymour already remembers this.');
      }

      throw error;
    }
  }

  async remove(
    userId: string,
    now: Date,
    plan: (items: MemoryItem[]) => MemoryRemoval,
  ) {
    await this.db.$transaction(async (tx) => {
      const items = await this.lockedItems(tx, userId, now);
      const removal = plan(items);

      await tx.memoryItem.deleteMany({
        where: { userId, id: { in: removal.ids } },
      });
    });
  }

  async activeIds(userId: string, ids: string[]) {
    const rows = await this.db.memoryItem.findMany({
      where: { userId, status: 'active', id: { in: ids } },
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }

  private async lockedItems(tx: Transaction, userId: string, now: Date) {
    await lockLearner(tx, userId);
    await purgeExpired(tx, userId, now);

    const rows = await tx.memoryItem.findMany({ where: { userId } });

    return rows.map(toMemoryItem);
  }

  private apply(
    tx: Transaction,
    userId: string,
    write: MemoryWrite,
    now: Date,
  ) {
    if (write.action === 'create') {
      return tx.memoryItem.create({
        data: {
          userId,
          kind: write.kind,
          text: write.text,
          status: 'active',
          origin: 'learner',
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    if (write.action === 'update') {
      return tx.memoryItem.update({
        where: { id: write.id },
        data: { kind: write.kind, text: write.text, updatedAt: now },
      });
    }

    return tx.memoryItem.update({
      where: { id: write.id },
      data: { status: 'active', expiresAt: null, updatedAt: now },
    });
  }
}
