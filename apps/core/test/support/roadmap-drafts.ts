import { SourceIngestionService } from '../../src/sources/application/source-ingestion.service.js';
import { createTestApp } from './app.js';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ParserSyntaxChecker } from '../../src/analysis/infrastructure/parser-syntax-checker.js';
import { ExecutionStreamService } from '../../src/executions/application/execution-stream.service.js';
import type { ExecutionWorkerService } from '../../src/executions/application/execution-worker.service.js';
import { ExecutionService } from '../../src/executions/application/execution.service.js';
import { SourceServiceCatalog } from '../../src/executions/infrastructure/source-catalog.js';
import { PrismaService } from '../../src/common/infrastructure/database/prisma.service.js';
import { SourceService } from '../../src/sources/application/source.service.js';
import type { SourceStorage } from '../../src/sources/domain/ports/source-storage.js';
import { PrismaSourceRepository } from '../../src/sources/infrastructure/prisma-source-repository.js';
import { createExecutions } from './executions.js';

// These suites do not exercise the community catalog.
const noCatalog = { candidates: async () => [], publishedIds: async () => [] };

class FakeStorage implements SourceStorage {
  readonly bucket = 'papert-sources';
  readonly deleted: string[] = [];

  async presignUpload(key: string) {
    return `http://s3.test/${key}`;
  }

  async deleteAllVersions(key: string) {
    this.deleted.push(key);
  }

  async deleteAllVersionsUnder(prefix: string) {
    this.deleted.push(prefix);
  }

  async presignDownload(request: { key: string }) {
    return `http://s3.test/${request.key}`;
  }
}

export function roadmapDraftsHarness() {
  let app: INestApplication;
  let db: PrismaService;
  let executions: ExecutionService;
  let worker: ExecutionWorkerService;
  let sources: SourceService;
  let ingestion: SourceIngestionService;

  const storage = new FakeStorage();
  const queue = { publish: vi.fn(async (_id: string) => {}) };
  const users: string[] = [];
  const origin = 'http://localhost:3000';

  function api(method: 'get' | 'post' | 'delete', path: string, cookie = '') {
    return request(app.getHttpServer())
      [method](path)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('Content-Type', 'application/json');
  }

  async function learner() {
    const registered = await api('post', '/auth/register')
      .send({
        email: `drafts-${randomUUID()}@example.com`,
        password: 'a long drafts passphrase 1',
      })
      .expect(201);

    users.push(registered.body.user.id);

    return {
      userId: registered.body.user.id as string,
      cookie: String(registered.headers['set-cookie'][0]).split(';')[0],
    };
  }

  // Drafts pass the community check first; with no catalog it settles with no matches.
  async function draft(cookie: string, goal = 'Build a reservation API') {
    const draftPayload = { goal, level: 'intermediate' };

    const created = await api('post', '/study/drafts', cookie)
      .send(draftPayload)
      .expect(201);
    const workspaceId = created.body.workspaceId as string;

    const checkPayload = { requestKey: randomUUID(), kind: 'recommendation' };

    const check = await api(
      'post',
      `/executions/workspaces/${workspaceId}`,
      cookie,
    )
      .send(checkPayload)
      .expect(201);

    const claim = await worker.claim(check.body.id);
    const recommendationEvent = {
      version: 1,
      executionId: check.body.id,
      lease: claim.lease!,
      index: 1,
      status: 'completed',
      text: '',
      tokens: 0,
      recommendation: { matches: [] },
    };

    await worker.accept(recommendationEvent);

    return workspaceId;
  }

  function generate(
    cookie: string,
    workspaceId: string,
    requestKey = randomUUID(),
  ) {
    return api('post', `/executions/workspaces/${workspaceId}`, cookie).send({
      requestKey,
      kind: 'generation',
      effort: 'low',
    });
  }

  function completed(
    executionId: string,
    lease: string,
    roadmap: unknown,
    index = 2,
  ) {
    return {
      version: 1,
      executionId,
      lease,
      index,
      status: 'completed',
      text: 'Roadmap ready.',
      tokens: 4500,
      roadmap,
    };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.AUTH_TEST_DATABASE_URL;
    process.env.WEB_ORIGIN = origin;
    process.env.AUTH_JWE_ACTIVE_KID = 'drafts-test';
    process.env.AUTH_JWE_KEYS = JSON.stringify({
      'drafts-test': 'ef'.repeat(32),
    });

    const { app: started, module } = await createTestApp((builder) =>
      builder
        .overrideProvider(SourceIngestionService)
        .useFactory({
          inject: [PrismaService],
          factory: (prisma: PrismaService) =>
            new SourceIngestionService(
              new PrismaSourceRepository(prisma),
              storage,
              () => new Date(),
            ),
        })
        .overrideProvider(SourceService)
        .useFactory({
          inject: [PrismaService],
          factory: (prisma: PrismaService) =>
            new SourceService(
              new PrismaSourceRepository(prisma),
              storage,
              () => new Date(),
              randomUUID,
            ),
        })
        .overrideProvider(ExecutionService)
        .useFactory({
          inject: [PrismaService, SourceService],
          factory: (prisma: PrismaService, sources: SourceService) => {
            const built = createExecutions(
              prisma,
              queue,
              new ParserSyntaxChecker(),
              new SourceServiceCatalog(sources),
              noCatalog,
            );

            worker = built.worker;

            return built.service;
          },
        }),
    );

    app = started;

    db = module.get(PrismaService);
    executions = module.get(ExecutionService);
    sources = module.get(SourceService);
    ingestion = module.get(SourceIngestionService);
    vi.spyOn(module.get(ExecutionStreamService), 'broadcast').mockResolvedValue(
      undefined,
    );
  });

  afterAll(async () => {
    // Roadmap authors cannot be deleted (RESTRICT).
    const authors = await db?.roadmap.findMany({
      where: { authorUserId: { in: users } },
      select: { authorUserId: true },
    });
    const kept = new Set(authors?.map((roadmap) => roadmap.authorUserId));

    await db?.workspace.deleteMany({ where: { userId: { in: users } } });
    await db?.user.deleteMany({
      where: { id: { in: users.filter((id) => !kept.has(id)) } },
    });
    await app?.close();
  });

  return {
    api,
    learner,
    draft,
    generate,
    completed,
    get db() {
      return db;
    },
    get executions() {
      return executions;
    },
    get worker() {
      return worker;
    },
    storage,
    get ingestion() {
      return ingestion;
    },
    get sources() {
      return sources;
    },
  };
}
