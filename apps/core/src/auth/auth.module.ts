import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { AuthService } from './application/auth.service.js';
import { SignInRateLimiter } from './application/sign-in-rate-limiter.js';
import { PrismaAttemptStore } from './infrastructure/prisma-attempt-store.js';
import {
  AuthController,
  AUTH_ORIGIN,
} from './infrastructure/auth.controller.js';
import { ArgonPasswords } from './infrastructure/argon-passwords.js';
import { JweTokens } from './infrastructure/jwe-tokens.js';
import { OpaqueRefreshTokens } from './infrastructure/opaque-refresh-tokens.js';
import { PrismaAuthRepository } from './infrastructure/prisma-auth-repository.js';
import {
  emailHashKey,
  SECURITY_EVENTS,
  StructuredSecurityLog,
} from './infrastructure/security-log.js';
import type { SecurityEvents } from './domain/ports/security-events.js';
import { PrismaService } from '../common/infrastructure/database/prisma.service.js';

@Module({
  controllers: [AuthController],
  exports: [AuthService, AUTH_ORIGIN, SECURITY_EVENTS],
  providers: [
    {
      provide: SECURITY_EVENTS,
      useFactory: () =>
        new StructuredSecurityLog(() =>
          emailHashKey(
            process.env.AUTH_JWE_ACTIVE_KID ?? '',
            process.env.AUTH_JWE_KEYS ?? '{}',
          ),
        ),
    },
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
      inject: [PrismaService, SECURITY_EVENTS],
      useFactory: (db: PrismaService, events: SecurityEvents) => {
        const repository = new PrismaAuthRepository(db);
        const passwords = new ArgonPasswords();
        const tokens = new JweTokens(
          process.env.AUTH_JWE_ACTIVE_KID ?? '',
          process.env.AUTH_JWE_KEYS ?? '{}',
        );

        const limiter = new SignInRateLimiter(
          new PrismaAttemptStore(db),
          events,
        );

        return new AuthService(
          repository,
          passwords,
          tokens,
          new OpaqueRefreshTokens(),
          limiter,
          events,
          () => new Date(),
          randomUUID,
        );
      },
    },
  ],
})
export class AuthModule {}
