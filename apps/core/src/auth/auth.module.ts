import { Module } from '@nestjs/common';
import { AuthService } from './application/auth.service.js';
import { SignInRateLimiter } from './application/sign-in-rate-limiter.js';
import { PrismaAttemptStore } from './infrastructure/prisma-attempt.store.js';
import {
  AuthController,
  AUTH_ORIGIN,
} from './infrastructure/auth.controller.js';
import { ArgonPasswords, JweTokens } from './infrastructure/crypto.js';
import { PrismaAuthRepository } from './infrastructure/prisma-auth.repository.js';
import { PrismaService } from '../infrastructure/database/prisma.service.js';

@Module({
  controllers: [AuthController],
  exports: [AuthService, AUTH_ORIGIN],
  providers: [
    {
      provide: AUTH_ORIGIN,
      useFactory: () => {
        const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

        if (
          new URL(origin).origin !== origin ||
          (process.env.NODE_ENV === 'production' &&
            !origin.startsWith('https://'))
        ) {
          throw new Error(
            'WEB_ORIGIN must be an exact origin (HTTPS in production).',
          );
        }

        return origin;
      },
    },
    {
      provide: AuthService,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => {
        const repository = new PrismaAuthRepository(db);
        const passwords = new ArgonPasswords();
        const tokens = new JweTokens(
          process.env.AUTH_JWE_ACTIVE_KID ?? '',
          process.env.AUTH_JWE_KEYS ?? '{}',
        );

        const limiter = new SignInRateLimiter(new PrismaAttemptStore(db));

        return new AuthService(repository, passwords, tokens, limiter);
      },
    },
  ],
})
export class AuthModule {}
