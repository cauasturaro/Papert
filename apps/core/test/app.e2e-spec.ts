import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AuthService } from '../src/auth/application/auth.service.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/common/infrastructure/database/prisma.service.js';

describe('Application health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthService)
      .useValue({})
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
        $connect: vi.fn(),
        $disconnect: vi.fn(),
        onModuleInit: vi.fn(),
        onModuleDestroy: vi.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('does not expose a starter root endpoint', () => {
    return request(app.getHttpServer()).get('/').expect(404);
  });

  it('/health (GET) returns ok', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ status: 'ok', db: 'connected' });
      });
  });

  it('/health (GET) returns 503 when the database is unavailable', async () => {
    const database = app.get(PrismaService);
    vi.spyOn(database, '$queryRaw').mockRejectedValueOnce(new Error('db down'));

    await request(app.getHttpServer())
      .get('/health')
      .expect(503)
      .expect({ status: 'degraded', db: 'unreachable' });
  });

  afterEach(async () => {
    await app.close();
  });
});
