import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ParserSyntaxChecker } from '../../src/analysis/infrastructure/parser-syntax-checker.js';
import { AppModule } from '../../src/app.module.js';
import type { ExecutionWorkerService } from '../../src/executions/application/execution-worker.service.js';
import { ExecutionService } from '../../src/executions/application/execution.service.js';
import { SourceServiceCatalog } from '../../src/executions/infrastructure/source-catalog.js';
import { configureHttp } from '../../src/http.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { SourceService } from '../../src/sources/application/source.service.js';
import type { SourceStorage } from '../../src/sources/domain/ports/source-storage.js';
import { PrismaSourceRepository } from '../../src/sources/infrastructure/prisma-source-repository.js';
import { createExecutions } from './executions.js';

// These suites do not exercise the community catalog.
const noCatalog = { candidates: async () => [], publishedIds: async () => [] };

class FakeStorage implements SourceStorage {
  readonly bucket = 'papert-sources';
  readonly deleted: string[] = [];
  failDeletes = false;

  async presignUpload(key: string, contentType: string, size: number) {
    return `http://s3.test/${key}?type=${contentType}&size=${size}`;
  }

  async deleteAllVersions(key: string) {
    if (this.failDeletes) {
      throw new Error('S3 unavailable');
    }

    this.deleted.push(key);
  }

  async deleteAllVersionsUnder(prefix: string) {
    if (this.failDeletes) {
      throw new Error('S3 unavailable');
    }

    this.deleted.push(prefix);
  }

  async presignDownload(request: {
    key: string;
    versionId?: string;
    attachmentFilename?: string;
  }) {
    const version = request.versionId ?? 'none';
    const disposition = request.attachmentFilename ? 'attachment' : 'inline';

    return `http://s3.test/${request.key}?version=${version}&${disposition}`;
  }
}

export function sourcesHarness() {
  let app: INestApplication;
  let db: PrismaService;
  let sources: SourceService;
  let worker: ExecutionWorkerService;

  const storage = new FakeStorage();
  const users: string[] = [];
  const origin = 'http://localhost:3000';

  function api(method: 'get' | 'post' | 'delete', path: string, cookie = '') {
    return request(app.getHttpServer())
      [method](path)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('Content-Type', 'application/json');
  }

  async function student() {
    const registered = await api('post', '/auth/register')
      .send({
        email: `sources-${randomUUID()}@example.com`,
        password: 'a long sources passphrase 1',
      })
      .expect(201);

    users.push(registered.body.user.id);

    const cookie = String(registered.headers['set-cookie'][0]).split(';')[0];

    await api('get', '/study/roadmaps/fixture', cookie).expect(200);

    const started = await api(
      'post',
      '/study/roadmaps/http-service-foundations/start',
      cookie,
    )
      .send({})
      .expect(200);

    return {
      cookie,
      userId: registered.body.user.id as string,
      base: `/study/workspaces/${started.body.id}/sources`,
      workspaceId: started.body.id as string,
    };
  }

  function created(source: { id: string; format: string }, sequencer: string) {
    return {
      action: 'begin',
      bucket: 'papert-sources',
      key: `documents/${source.id}/original.${source.format}`,
      versionId: `v-${sequencer}`,
      sequencer,
      size: 42,
    };
  }

  function completed(documentId: string, sequencer: string) {
    return {
      action: 'complete',
      documentId,
      versionId: `v-${sequencer}`,
      sequencer,
      chunkCount: 3,
      characterCount: 900,
      pageCount: 2,
      embeddingTokens: 240,
      warnings: [],
    };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.AUTH_TEST_DATABASE_URL;
    process.env.WEB_ORIGIN = origin;
    process.env.AUTH_JWE_ACTIVE_KID = 'sources-test';
    process.env.AUTH_JWE_KEYS = JSON.stringify({
      'sources-test': 'ef'.repeat(32),
    });

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ExecutionService)
      .useFactory({
        inject: [PrismaService, SourceService],
        factory: (prisma: PrismaService, sourceService: SourceService) => {
          const built = createExecutions(
            prisma,
            { publish: async () => {} },
            new ParserSyntaxChecker(),
            new SourceServiceCatalog(sourceService),
            noCatalog,
          );

          worker = built.worker;

          return built.service;
        },
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
      .compile();

    app = module.createNestApplication();
    configureHttp(app);
    await app.init();

    db = module.get(PrismaService);
    sources = module.get(SourceService);
  });

  afterAll(async () => {
    if (db) {
      await db.user.deleteMany({ where: { id: { in: users } } });
    }

    await app?.close();
  });

  return {
    api,
    student,
    created,
    completed,
    get db() {
      return db;
    },
    get sources() {
      return sources;
    },
    get worker() {
      return worker;
    },
    storage,
  };
}
