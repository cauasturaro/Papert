import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureHttp } from '../../src/http.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';

export function studyHarness() {
  let app: INestApplication;
  let db: PrismaService;

  const users: string[] = [];
  const origin = 'http://localhost:3000';
  const base = '/study';

  async function boot() {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    configureHttp(app);
    await app.init();

    db = module.get(PrismaService);
  }

  // A full application restart over the same database.
  async function restart() {
    await app.close();
    await boot();
  }

  function api(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
    cookie = '',
  ) {
    return request(app.getHttpServer())
      [method](path)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('Content-Type', 'application/json');
  }

  async function register() {
    const response = await api('post', '/auth/register')
      .send({
        email: `study-${randomUUID()}@example.com`,
        password: 'a long study passphrase 1',
      })
      .expect(201);

    users.push(response.body.user.id);

    return String(response.headers['set-cookie'][0]).split(';')[0];
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.AUTH_TEST_DATABASE_URL;
    process.env.WEB_ORIGIN = origin;
    process.env.AUTH_JWE_ACTIVE_KID = 'study-test';
    process.env.AUTH_JWE_KEYS = JSON.stringify({
      'study-test': 'cd'.repeat(32),
    });

    await boot();
  });

  afterAll(async () => {
    if (db) {
      await db.user.deleteMany({ where: { id: { in: users } } });
    }

    await app?.close();
  });

  return {
    api,
    register,
    restart,
    base,
    get db() {
      return db;
    },
  };
}
