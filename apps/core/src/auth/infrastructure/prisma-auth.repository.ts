import { Prisma } from '@prisma/client';
import type { AuthRepository } from '../domain/auth.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly db: PrismaService) {}

  async createUser(email: string, passwordHash: string) {
    try {
      return await this.db.user.create({ data: { email, passwordHash } });
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

  createSession(userId: string, tokenId: string, expiresAt: Date) {
    return this.db.authSession.create({ data: { userId, tokenId, expiresAt } });
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
      include: { user: true },
    });
  }

  async rotateSession(id: string, oldTokenId: string, tokenId: string) {
    const { count } = await this.db.authSession.updateMany({
      where: {
        id,
        tokenId: oldTokenId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { tokenId },
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
