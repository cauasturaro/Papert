import { createHash, randomInt, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  AuthController,
  AUTH_ORIGIN,
  SECURITY_EVENTS,
} from '../src/auth/infrastructure/auth.controller.js';
import type { SecurityEvent } from '../src/auth/domain/ports/security-events.js';
import {
  AuthService,
  REFRESH_REUSE_GRACE_SECONDS,
} from '../src/auth/application/auth.service.js';
import { SignInRateLimiter } from '../src/auth/application/sign-in-rate-limiter.js';
import { PrismaAttemptStore } from '../src/auth/infrastructure/prisma-attempt-store.js';
import { ArgonPasswords } from '../src/auth/infrastructure/argon-passwords.js';
import { JweTokens } from '../src/auth/infrastructure/jwe-tokens.js';
import { OpaqueRefreshTokens } from '../src/auth/infrastructure/opaque-refresh-tokens.js';
import { PrismaAuthRepository } from '../src/auth/infrastructure/prisma-auth-repository.js';
import { PrismaService } from '../src/common/infrastructure/database/prisma.service.js';
import { configureHttp } from '../src/http.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Authentication HTTP + PostgreSQL',
  () => {
    let app: INestApplication;
    let db: PrismaService;

    const emails: string[] = [];
    const securityEvents: SecurityEvent[] = [];
    const events = {
      record: (event: SecurityEvent) => securityEvents.push(event),
    };
    const previousEdgeSecret = process.env.EDGE_PROXY_SECRET;
    const edgeSecret = 'auth-e2e-edge-secret';
    const origin = 'http://localhost:3000';
    const password = 'test passphrase';
    const tokens = new JweTokens(
      'test',
      JSON.stringify({ test: 'ab'.repeat(32) }),
    );

    function post(path: string, cookie = '') {
      return request(app.getHttpServer())
        .post(`/auth/${path}`)
        .set('X-Papert-Edge', edgeSecret)
        .set('Origin', origin)
        .set('Content-Type', 'application/json')
        .set('Cookie', cookie);
    }

    function setCookies(response: request.Response) {
      return response.headers['set-cookie'] as unknown as string[];
    }

    // The access cookie alone, as a stolen access token would be.
    function cookie(response: request.Response) {
      return setCookies(response)[0].split(';')[0];
    }

    function cookies(response: request.Response) {
      return setCookies(response)
        .map((header) => header.split(';')[0])
        .join('; ');
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
          { provide: SECURITY_EVENTS, useValue: events },
          {
            provide: AuthService,
            useValue: new AuthService(
              new PrismaAuthRepository(db),
              new ArgonPasswords(),
              tokens,
              new OpaqueRefreshTokens(),
              new SignInRateLimiter(new PrismaAttemptStore(db), events),
              events,
              () => new Date(),
              randomUUID,
            ),
          },
        ],
      }).compile();

      app = module.createNestApplication();
      process.env.EDGE_PROXY_SECRET = edgeSecret;
      configureHttp(app, { defaultProxyHops: 1 });
      await app.init();
    });

    afterAll(async () => {
      if (previousEdgeSecret === undefined) {
        delete process.env.EDGE_PROXY_SECRET;
      } else {
        process.env.EDGE_PROXY_SECRET = previousEdgeSecret;
      }

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
        .set('X-Forwarded-For', '203.0.113.50')
        .send({})
        .expect(403);
      expect(securityEvents).toContainEqual({
        type: 'origin_rejected',
        peer: '203.0.113.50',
        method: 'POST',
        path: '/auth/logout',
        origin: 'https://attacker.example',
      });

      await post('refresh', cookie(firstAccount)).send({}).expect(401);
      const renewed = await post('refresh', cookies(firstAccount))
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
      await post('refresh', cookies(renewed)).send({}).expect(401);

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

    it('sets a long-lived refresh cookie scoped to the auth routes', async () => {
      const account = await register();

      const [access, refresh] = setCookies(account);
      const stored = await db.authSession.findUniqueOrThrow({
        where: { id: account.body.sessionId },
      });
      const refreshValue = refresh.split(';')[0].split('=')[1];

      expect(access).toMatch(/^papert_session=.*Max-Age=(899|900);/);
      expect(refresh).toMatch(/^papert_refresh=[A-Za-z0-9_-]{43};/);
      expect(refresh).toMatch(/Max-Age=60(479\d|4800);/);
      expect(refresh).toContain('Path=/api/auth;');
      expect(refresh).toContain('HttpOnly');
      expect(refresh).toContain('SameSite=Strict');
      expect(account.body).not.toHaveProperty('refreshToken');
      expect(stored.refreshHash).toBe(
        createHash('sha256').update(refreshValue).digest('hex'),
      );
    });

    it('renews with the refresh cookie alone and detects a replayed one', async () => {
      const account = await register();
      const original = cookies(account).split('; ')[1];

      const renewed = await post('refresh', original).send({}).expect(200);
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', cookie(renewed))
        .expect(200);

      await post('refresh', original).send({}).expect(401);
      const withinGrace = await db.authSession.findUniqueOrThrow({
        where: { id: account.body.sessionId },
      });
      expect(withinGrace.revokedAt).toBeNull();

      await db.authSession.update({
        where: { id: account.body.sessionId },
        data: {
          refreshRotatedAt: new Date(
            Date.now() - (REFRESH_REUSE_GRACE_SECONDS + 1) * 1000,
          ),
        },
      });
      await post('refresh', original)
        .set('X-Forwarded-For', '203.0.113.99')
        .send({})
        .expect(401);

      const revoked = await db.authSession.findUniqueOrThrow({
        where: { id: account.body.sessionId },
      });
      expect(revoked.revokedAt).not.toBeNull();
      await post('refresh', cookies(renewed)).send({}).expect(401);
      expect(securityEvents).toContainEqual({
        type: 'refresh_reuse',
        userId: account.body.user.id,
        sessionId: account.body.sessionId,
        peer: '203.0.113.99',
      });
    });

    it('signs out with only the refresh cookie and clears both cookies', async () => {
      const account = await register();
      const refreshOnly = cookies(account).split('; ')[1];

      const response = await post('logout', refreshOnly).send({}).expect(204);

      const session = await db.authSession.findUniqueOrThrow({
        where: { id: account.body.sessionId },
      });
      const cleared = setCookies(response);
      expect(session.revokedAt).not.toBeNull();
      expect(cleared).toHaveLength(2);
      expect(cleared[0]).toMatch(/^papert_session=;.*Path=\/api;/);
      expect(cleared[1]).toMatch(/^papert_refresh=;.*Path=\/api\/auth;/);
    });

    it('upgrades a session created before refresh credentials once', async () => {
      const account = await register();
      await db.authSession.update({
        where: { id: account.body.sessionId },
        data: { refreshHash: null },
      });

      const upgraded = await post('refresh', cookie(account))
        .send({})
        .expect(200);
      const replay = await post('refresh', cookie(account)).send({});

      const session = await db.authSession.findUniqueOrThrow({
        where: { id: account.body.sessionId },
      });
      expect(setCookies(upgraded)).toHaveLength(2);
      expect(session.refreshHash).not.toBeNull();
      expect(replay.status).toBe(401);
    });

    it('loads sessions without the password hash', async () => {
      const registered = await register();
      const repository = new PrismaAuthRepository(db);

      const session = await repository.findSession(registered.body.sessionId);

      expect(Object.keys(session!.user).sort()).toEqual(['email', 'id']);
    });

    it('keeps forwarded client addresses in separate sign-in buckets', async () => {
      const account = await register();
      const email = account.body.user.email;
      const attacker = `203.0.113.${randomInt(1, 255)}`;
      const victim = `198.51.100.${randomInt(1, 255)}`;
      const exhaustedPeer = createHash('sha256')
        .update(`peer:${attacker}`)
        .digest('hex');
      const attemptKeys = [exhaustedPeer];

      try {
        await db.authAttempt.create({
          data: {
            key: exhaustedPeer,
            count: 300,
            resetsAt: new Date(Date.now() + 60_000),
          },
        });

        const throttled = await post('login')
          .set('X-Forwarded-For', attacker)
          .send({ email, password });
        const allowed = await post('login')
          .set('X-Forwarded-For', victim)
          .send({ email, password });

        expect(throttled.status).toBe(429);
        expect(throttled.headers['retry-after']).toBe('900');
        expect(allowed.status).toBe(200);
      } finally {
        await db.authAttempt.deleteMany({
          where: { key: { in: attemptKeys } },
        });
      }
    });

    it('ignores spoofed XFF on direct calls without valid Web proof', async () => {
      for (const proof of [null, 'invalid-edge-proof']) {
        const call = post('login').set('X-Forwarded-For', '198.51.100.77');
        if (proof === null) {
          call.unset('X-Papert-Edge');
        } else {
          call.set('X-Papert-Edge', proof);
        }
        const email = `${randomUUID()}@example.com`;

        await call.send({ email, password: 'incorrect password' }).expect(401);

        const event = securityEvents.at(-1);
        expect(event).toMatchObject({ type: 'sign_in_failed' });
        expect(event).toHaveProperty(
          'peer',
          expect.stringMatching(/127\.0\.0\.1|::1/),
        );
      }
    });

    it('locks out only the client that keeps guessing a password', async () => {
      const account = await register();
      const email = account.body.user.email;
      const attacker = `203.0.113.${randomInt(1, 255)}`;
      const victim = `198.51.100.${randomInt(1, 255)}`;
      const attemptKeys = [
        `peer:${attacker}`,
        `peer:${victim}`,
        `account-peer:${JSON.stringify([email, attacker])}`,
        `account-peer:${JSON.stringify([email, victim])}`,
        `account:${email}`,
      ].map((scope) => createHash('sha256').update(scope).digest('hex'));

      try {
        for (let i = 0; i < 10; i++) {
          await post('login')
            .set('X-Forwarded-For', attacker)
            .send({ email, password: 'wrong password' })
            .expect(401);
        }

        await post('login')
          .set('X-Forwarded-For', attacker)
          .send({ email, password })
          .expect(429);
        await post('login')
          .set('X-Forwarded-For', victim)
          .send({ email, password })
          .expect(200);
      } finally {
        await db.authAttempt.deleteMany({
          where: { key: { in: attemptKeys } },
        });
      }
    });

    it('releases and clears attempt buckets', async () => {
      const key = `test-${randomUUID()}`;
      const attemptsStore = new PrismaAttemptStore(db);

      try {
        await attemptsStore.consumeAttempt(key, 2, 900);
        await attemptsStore.consumeAttempt(key, 2, 900);
        await attemptsStore.releaseAttempt(key);
        const afterRelease = await attemptsStore.consumeAttempt(key, 2, 900);

        await attemptsStore.clearAttempts(key);
        const cleared = await db.authAttempt.findUnique({ where: { key } });

        expect(afterRelease).toBe(true);
        expect(cleared).toBeNull();
      } finally {
        await db.authAttempt.deleteMany({ where: { key } });
      }
    });

    it('counts concurrent attempts atomically and resets elapsed windows', async () => {
      const key = `test-${randomUUID()}`;
      const attemptsStore = new PrismaAttemptStore(db);

      try {
        const attempts = await Promise.all(
          Array.from({ length: 20 }, () =>
            attemptsStore.consumeAttempt(key, 10, 900),
          ),
        );
        expect(attempts.filter(Boolean)).toHaveLength(10);

        await db.authAttempt.update({
          where: { key },
          data: { resetsAt: new Date(Date.now() - 1000) },
        });
        expect(await attemptsStore.consumeAttempt(key, 10, 900)).toBe(true);
      } finally {
        await db.authAttempt.delete({ where: { key } });
      }
    });
  },
);
