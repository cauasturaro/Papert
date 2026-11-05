import { createExecutions } from './executions.js';
import type { ExecutionWorkerService } from '../../src/executions/application/execution-worker.service.js';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { ParserSyntaxChecker } from '../../src/analysis/infrastructure/parser-syntax-checker.js';
import { CommunityService } from '../../src/community/application/community.service.js';
import { ExecutionService } from '../../src/executions/application/execution.service.js';
import { ExecutionStreamService } from '../../src/executions/application/execution-stream.service.js';
import { CommunityRecommendationCatalog } from '../../src/executions/infrastructure/community-catalog.js';
import { SourceServiceCatalog } from '../../src/executions/infrastructure/source-catalog.js';
import { configureHttp } from '../../src/http.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { SourceService } from '../../src/sources/application/source.service.js';

const PRIVATE_FILENAME = 'team-conventions.md';

function definition(title: string, content: string) {
  const step = (id: string, requires: string[]) => ({
    id,
    title: `${title} ${id}`,
    content,
    concepts: ['Ports'],
    requires,
    challenge: {
      instructions: 'Write the module.',
      criteria: [
        { id: `${id}-file`, description: 'The module file exists.' },
        { id: `${id}-export`, description: 'The module exports its port.' },
      ],
    },
  });

  return {
    title,
    description: 'A generated roadmap about reservation services.',
    level: 'intermediate',
    steps: [step('one', []), step('two', ['one']), step('three', ['two'])],
    starterFiles: { 'src/reservation.ts': 'export {};\n' },
  };
}

export function communityHarness() {
  let app: INestApplication;
  let db: PrismaService;
  let executions: ExecutionService;
  let worker: ExecutionWorkerService;

  const queue = { publish: vi.fn(async (_id: string) => {}) };
  const users: string[] = [];
  const origin = 'http://localhost:3000';

  function api(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    cookie = '',
  ) {
    return request(app.getHttpServer())
      [method](path)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('Content-Type', 'application/json');
  }

  async function learner() {
    const registered = await api('post', '/auth/register')
      .send({
        email: `community-${randomUUID()}@example.com`,
        password: 'a long community passphrase 1',
      })
      .expect(201);

    users.push(registered.body.user.id);

    return {
      userId: registered.body.user.id as string,
      email: registered.body.user.email as string,
      cookie: String(registered.headers['set-cookie'][0]).split(';')[0],
    };
  }

  // A generated roadmap retains its private source references until publication.
  async function generated(userId: string, content: string) {
    const roadmapId = randomUUID();
    const workspaceId = randomUUID();
    const sourceId = randomUUID();

    await db.roadmap.create({
      data: {
        id: roadmapId,
        authorName: 'Papert learner',
        authorUserId: userId,
        definition: definition(
          `Reservations ${roadmapId.slice(0, 8)}`,
          content,
        ),
      },
    });
    await db.workspace.create({
      data: {
        id: workspaceId,
        userId,
        roadmapId,
        files: { 'src/reservation.ts': 'export const mine = 1;\n' },
      },
    });
    await db.studySession.create({ data: { workspaceId } });
    await db.roadmapDraft.create({
      data: {
        workspaceId,
        userId,
        goal: 'Build a reservation API with ports',
        level: 'intermediate',
        status: 'generated',
        outcome: {
          roadmapId,
          executionId: randomUUID(),
          evidence: [],
          consulted: [{ id: sourceId, filename: PRIVATE_FILENAME }],
        },
      },
    });
    await db.sourceDocument.create({
      data: {
        id: sourceId,
        workspaceId,
        uploadedByUserId: userId,
        bucket: 'papert-sources',
        objectKey: `documents/${sourceId}/original.md`,
        filename: PRIVATE_FILENAME,
        format: 'md',
        contentType: 'text/markdown',
        sizeBytes: 900,
        status: 'ready',
        objectVersionId: 'v-1',
        sequencer: '0001',
        chunkCount: 3,
        readyAt: new Date(),
        uploadExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    return { roadmapId, workspaceId, sourceId };
  }

  function publish(cookie: string, roadmapId: string, authorName = 'Ana Dev') {
    return api('post', `/community/roadmaps/${roadmapId}/publish`, cookie).send(
      {
        authorName,
        acknowledged: true,
      },
    );
  }

  function vote(cookie: string, roadmapId: string, value: number) {
    return api('put', `/community/roadmaps/${roadmapId}/vote`, cookie).send({
      value,
    });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.AUTH_TEST_DATABASE_URL;
    process.env.WEB_ORIGIN = origin;
    process.env.AUTH_JWE_ACTIVE_KID = 'community-test';
    process.env.AUTH_JWE_KEYS = JSON.stringify({
      'community-test': 'cd'.repeat(32),
    });

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ExecutionService)
      .useFactory({
        inject: [PrismaService, SourceService, CommunityService],
        factory: (
          prisma: PrismaService,
          sources: SourceService,
          community: CommunityService,
        ) => {
          const built = createExecutions(
            prisma,
            queue,
            new ParserSyntaxChecker(),
            new SourceServiceCatalog(sources),
            new CommunityRecommendationCatalog(community),
          );

          worker = built.worker;

          return built.service;
        },
      })
      .compile();

    app = module.createNestApplication();
    configureHttp(app);
    await app.init();

    db = module.get(PrismaService);
    executions = module.get(ExecutionService);
    vi.spyOn(module.get(ExecutionStreamService), 'broadcast').mockResolvedValue(
      undefined,
    );
  });

  afterAll(async () => {
    // Votes RESTRICT their voter and roadmaps RESTRICT their author.
    const voters = await db?.roadmapVote.findMany({
      where: { userId: { in: users } },
      select: { userId: true },
    });
    const authors = await db?.roadmap.findMany({
      where: { authorUserId: { in: users } },
      select: { authorUserId: true },
    });
    const kept = new Set([
      ...(voters ?? []).map((row) => row.userId),
      ...(authors ?? []).map((row) => row.authorUserId),
    ]);

    await db?.user.deleteMany({
      where: { id: { in: users.filter((id) => !kept.has(id)) } },
    });
    await app?.close();
  });

  return {
    api,
    learner,
    generated,
    publish,
    vote,
    get db() {
      return db;
    },
    get executions() {
      return executions;
    },
    get worker() {
      return worker;
    },
  };
}
