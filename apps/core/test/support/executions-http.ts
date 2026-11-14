import { createTestApp } from './app.js';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ParserSyntaxChecker } from '../../src/analysis/infrastructure/parser-syntax-checker.js';
import { ExecutionStreamService } from '../../src/executions/application/execution-stream.service.js';
import type { ExecutionWorkerService } from '../../src/executions/application/execution-worker.service.js';
import { ExecutionService } from '../../src/executions/application/execution.service.js';
import { PrismaService } from '../../src/common/infrastructure/database/prisma.service.js';
import { createExecutions } from './executions.js';

// These suites do not exercise the community catalog.
export const noCatalog = {
  candidates: async () => [],
  publishedIds: async () => [],
};

// These suites do not exercise workspace sources.
export const noSources = { ready: async () => [] };

export function executionsHarness() {
  let app: INestApplication;
  let db: PrismaService;
  let service: ExecutionService;
  let worker: ExecutionWorkerService;
  let now: Date;
  const queue = { publish: vi.fn(async (_id: string) => {}) };
  const users: string[] = [];
  const origin = 'http://localhost:3000';

  function api(method: 'get' | 'post', path: string, cookie = '') {
    return request(app.getHttpServer())
      [method](`/executions/${path}`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('Content-Type', 'application/json');
  }

  async function student() {
    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .set('Origin', origin)
      .send({
        email: `${randomUUID()}@example.com`,
        password: 'a long testing password 1',
      })
      .expect(201);
    const userId = registered.body.user.id as string;
    const cookie = String(registered.headers['set-cookie'][0]).split(';')[0];

    users.push(userId);

    const fixture = await request(app.getHttpServer())
      .get('/study/roadmaps/fixture')
      .set('Cookie', cookie)
      .expect(200);
    const started = await request(app.getHttpServer())
      .post(`/study/roadmaps/${fixture.body.id}/start`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({})
      .expect(200);

    return { userId, cookie, workspaceId: started.body.id as string };
  }

  function payload() {
    return {
      requestKey: randomUUID(),
      revision: 0,
      kind: 'chat',
      prompt: 'Help me understand the criteria.',
    };
  }

  function event(
    id: string,
    lease: string,
    index = 1,
    status = 'completed',
    tokens = 50,
  ) {
    return {
      version: 1,
      executionId: id,
      lease,
      index,
      status,
      text: `Snapshot ${index}`,
      tokens,
    };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.AUTH_TEST_DATABASE_URL;
    process.env.WEB_ORIGIN = origin;
    process.env.AUTH_JWE_ACTIVE_KID = 'execution-test';
    process.env.AUTH_JWE_KEYS = JSON.stringify({
      'execution-test': 'ef'.repeat(32),
    });

    const { app: started, module } = await createTestApp((builder) =>
      builder.overrideProvider(ExecutionService).useFactory({
        inject: [PrismaService],
        factory: (database: PrismaService) => {
          const built = createExecutions(
            database,
            queue,
            new ParserSyntaxChecker(),
            noSources,
            noCatalog,
            () => now,
          );

          worker = built.worker;

          return built.service;
        },
      }),
    );

    app = started;

    db = module.get(PrismaService);
    service = module.get(ExecutionService);
    vi.spyOn(module.get(ExecutionStreamService), 'broadcast').mockResolvedValue(
      undefined,
    );
  });

  beforeEach(() => {
    now = new Date('2026-11-02T12:00:00Z');
    queue.publish.mockReset();
    queue.publish.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: { in: users } } });
    await app?.close();
  });

  return {
    api,
    student,
    payload,
    event,
    get app() {
      return app;
    },
    get db() {
      return db;
    },
    get service() {
      return service;
    },
    get worker() {
      return worker;
    },
    get now() {
      return now;
    },
    set now(value: typeof now) {
      now = value;
    },
    queue,
    origin,
  };
}
