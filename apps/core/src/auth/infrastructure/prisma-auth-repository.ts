import { Prisma } from '@prisma/client';
import type { AuthRepository } from '../domain/ports/auth-repository.js';
import type { PrismaService } from '../../common/infrastructure/database/prisma.service.js';

const USER_FIELDS = { id: true, email: true } as const;

// Refresh hashes stay out of the request principal.
const SESSION_FIELDS = {
  id: true,
  userId: true,
  tokenId: true,
  expiresAt: true,
  revokedAt: true,
} as const;

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly db: PrismaService) {}

  async createUser(email: string, passwordHash: string) {
    try {
      return await this.db.user.create({
        data: { email, passwordHash },
        select: USER_FIELDS,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }

      throw error;
    }
  }

  findUser(email: string) {
    return this.db.user.findUnique({ where: { email } });
  }

  createSession(
    userId: string,
    tokenId: string,
    expiresAt: Date,
    refreshHash: string,
  ) {
    return this.db.authSession.create({
      data: { userId, tokenId, expiresAt, refreshHash },
      select: SESSION_FIELDS,
    });
  }

  findSession(id: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      return Promise.resolve(null);
    }

    return this.db.authSession.findUnique({
      where: { id },
      select: { ...SESSION_FIELDS, user: { select: USER_FIELDS } },
    });
  }

  findSessionByRefresh(hash: string) {
    return this.db.authSession.findFirst({
      where: { OR: [{ refreshHash: hash }, { previousRefreshHash: hash }] },
      select: {
        ...SESSION_FIELDS,
        refreshHash: true,
        previousRefreshHash: true,
        refreshRotatedAt: true,
        user: { select: USER_FIELDS },
      },
    });
  }

  async rotateRefresh(
    id: string,
    currentHash: string,
    next: { tokenId: string; refreshHash: string; rotatedAt: Date },
  ) {
    const { count } = await this.db.authSession.updateMany({
      where: {
        id,
        refreshHash: currentHash,
        revokedAt: null,
        expiresAt: { gt: next.rotatedAt },
      },
      data: {
        tokenId: next.tokenId,
        refreshHash: next.refreshHash,
        previousRefreshHash: currentHash,
        refreshRotatedAt: next.rotatedAt,
      },
    });

    return count === 1;
  }

  async upgradeSession(
    id: string,
    oldTokenId: string,
    next: { tokenId: string; refreshHash: string; rotatedAt: Date },
  ) {
    const { count } = await this.db.authSession.updateMany({
      where: {
        id,
        tokenId: oldTokenId,
        refreshHash: null,
        revokedAt: null,
        expiresAt: { gt: next.rotatedAt },
      },
      data: {
        tokenId: next.tokenId,
        refreshHash: next.refreshHash,
        refreshRotatedAt: next.rotatedAt,
      },
    });

    return count === 1;
  }

  async revokeSession(id: string, userId: string) {
    await this.db.authSession.updateMany({
      where: { id, userId },
      data: { revokedAt: new Date() },
    });
  }
}
