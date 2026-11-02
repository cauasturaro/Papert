import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  AuthController,
  AUTH_ORIGIN,
} from '../src/auth/infrastructure/auth.controller.js';
import { AuthService } from '../src/auth/application/auth.service.js';
import { SignInRateLimiter } from '../src/auth/application/sign-in-rate-limiter.js';
import { PrismaAttemptStore } from '../src/auth/infrastructure/prisma-attempt.store.js';
import {
  ArgonPasswords,
  JweTokens,
} from '../src/auth/infrastructure/crypto.js';
import { PrismaAuthRepository } from '../src/auth/infrastructure/prisma-auth.repository.js';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { configureHttp } from '../src/http.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Authentication HTTP + PostgreSQL',
  () => {
    let app: INestApplication;
    let db: PrismaService;

    const emails: string[] = [];
    const origin = 'http://localhost:3000';
    const password = 'a long test passphrase';
    const tokens = new JweTokens(
      'test',
      JSON.stringify({ test: 'ab'.repeat(32) }),
    );

    function post(path: string, cookie = '') {
      return request(app.getHttpServer())
        .post(`/auth/${path}`)
        .set('Origin', origin)
        .set('Content-Type', 'application/json')
        .set('Cookie', cookie);
    }

    function cookie(response: request.Response) {
      return String(response.headers['set-cookie'][0]).split(';')[0];
    }

    async function register() {
      const email = `${randomUUID()}@example.com`;
      emails.push(email);

      return post('register').send({ email, password }).expect(201);
    }

    beforeAll(async () => {
      process.env.DATABASE_URL = process.env.AUTH_TEST_DATABASE_URL;
      db = new PrismaService();
      await db.$connect();

      const module = await Test.createTestingModule({
        controllers: [AuthController],
        providers: [
          { provide: AUTH_ORIGIN, useValue: origin },
          {
            provide: AuthService,
            useValue: new AuthService(
              new PrismaAuthRepository(db),
              new ArgonPasswords(),
              tokens,
              new SignInRateLimiter(new PrismaAttemptStore(db)),
            ),
          },
        ],
      }).compile();

      app = module.createNestApplication();
      configureHttp(app);
      await app.init();
    });

    afterAll(async () => {
      if (db) {
        await db.user.deleteMany({ where: { email: { in: emails } } });
        await db.$disconnect();
      }

      if (app) {
        await app.close();
      }
    });

    it('registers, authenticates, isolates, refreshes and logs out with secure response semantics', async () => {
      const firstAccount = await register();
      const secondAccount = await register();

      const header = firstAccount.headers['set-cookie'][0];

      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Strict');
      expect(header).toContain('Path=/api;');
      expect(firstAccount.headers['cache-control']).toBe('no-store');
      expect(firstAccount.body).not.toHaveProperty('token');
      expect(
        (
          await db.user.findUniqueOrThrow({
            where: { id: firstAccount.body.user.id },
          })
        ).passwordHash,
      ).toMatch(/^\$argon2id\$/);

      await request(app.getHttpServer()).get('/auth/me').expect(401);
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', cookie(firstAccount))
        .expect(200);
      await request(app.getHttpServer())
        .get(`/auth/sessions/${firstAccount.body.sessionId}`)
        .set('Cookie', cookie(firstAccount))
        .expect(200);
      await request(app.getHttpServer())
        .get(`/auth/sessions/${secondAccount.body.sessionId}`)
        .set('Cookie', cookie(firstAccount))
        .expect(404);

      await post('logout', cookie(firstAccount))
        .set('Origin', 'https://attacker.example')
        .send({})
        .expect(403);

      const renewed = await post('refresh', cookie(firstAccount))
        .send({})
        .expect(200);
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', cookie(firstAccount))
        .expect(401);

      await post('logout', cookie(renewed)).send({}).expect(204);
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', cookie(renewed))
        .expect(401);
      await post('refresh', cookie(renewed)).send({}).expect(401);

      await post('login')
        .send({ email: firstAccount.body.user.email, password })
        .expect(200);
      await post('login')
        .send({ email: firstAccount.body.user.email, password: 'wrong' })
        .expect(401);

      const claims = await tokens.read(cookie(secondAccount).split('=')[1]);
      const expired = await tokens.issue(
        claims.userId,
        claims.sessionId,
        claims.tokenId,
        new Date(Date.now() - 1000),
      );
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `papert_session=${expired}`)
        .expect(401);

      await request(app.getHttpServer())
        .get('/internal/resolve')
        .set('Authorization', `Bearer ${cookie(secondAccount)}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/internal/resolve')
        .set('Authorization', 'AWS4-HMAC-SHA256 forged')
        .expect(403);
    });

    it('counts concurrent attempts atomically and resets elapsed windows', async () => {
      const key = `test-${randomUUID()}`;
      const attemptsStore = new PrismaAttemptStore(db);

      try {
        const attempts = await Promise.all(
          Array.from({ length: 20 }, () =>
            attemptsStore.consumeAttempt(key, 10),
          ),
        );
        expect(attempts.filter(Boolean)).toHaveLength(10);

        await db.authAttempt.update({
          where: { key },
          data: { resetsAt: new Date(Date.now() - 1000) },
        });
        expect(await attemptsStore.consumeAttempt(key, 10)).toBe(true);
      } finally {
        await db.authAttempt.delete({ where: { key } });
      }
    });
  },
);
