import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ParserSyntaxChecker } from '../src/analysis/infrastructure/parser-syntax-checker.js';
import { ExecutionService } from '../src/executions/application/execution.service.js';
import { ExecutionStreamService } from '../src/executions/application/execution-stream.service.js';
import {
  GENERATION_ATTEMPT_BUDGET,
  MAX_ATTEMPTS,
} from '../src/executions/domain/quota.js';
import { PrismaExecutionRepository } from '../src/executions/infrastructure/prisma-execution-repository.js';
import { SourceServiceCatalog } from '../src/executions/infrastructure/source-catalog.js';
import { configureHttp } from '../src/http.js';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { SourceService } from '../src/sources/application/source.service.js';
import type { SourceStorage } from '../src/sources/domain/ports/source-storage.js';
import { PrismaSourceRepository } from '../src/sources/infrastructure/prisma-source-repository.js';
import { GENERATED_AUTHOR_NAME } from '../src/study/domain/roadmap-draft.js';
import { PrismaAttemptProgression } from '../src/study/infrastructure/prisma-attempt-progression.js';
import { PrismaRoadmapGeneration } from '../src/study/infrastructure/prisma-roadmap-generation.js';

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

function step(id: string, title: string, requires: string[] = []) {
  return {
    id,
    title,
    content: `Build ${title.toLowerCase()} for the reservation service.`,
    concepts: [title],
    requires,
    challenge: {
      instructions: `Implement ${title.toLowerCase()}.`,
      criteria: [
        { id: `${id}-file`, description: 'The module file exists.' },
        { id: `${id}-export`, description: 'The module exports its port.' },
      ],
    },
  };
}

function candidate(sourceId: string, foreignSourceId: string) {
  const definition = {
    title: 'Reservations with hexagonal NestJS',
    description: 'A generated path from domain rules to adapters.',
    level: 'intermediate',
    steps: [
      step('domain-rules', 'Domain rules'),
      step('ports', 'Ports', ['domain-rules']),
      step('adapters', 'Adapters', ['ports']),
    ],
    starterFiles: { 'src/reservation.ts': 'export {};\n' },
  };
  const location = { lineStart: 1, lineEnd: 4, headings: ['Conventions'] };

  return {
    definition,
    evidence: [
      { stepId: 'domain-rules', sourceId, cite: 'S1', location },
      // Not admitted with this execution.
      { stepId: 'ports', sourceId: foreignSourceId, cite: 'S2', location },
      // Unknown step.
      { stepId: 'missing', sourceId, cite: 'S1', location },
    ],
  };
}

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Roadmap drafts HTTP + PostgreSQL',
  () => {
    let app: INestApplication;
    let db: PrismaService;
    let executions: ExecutionService;

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

    async function draft(cookie: string, goal = 'Build a reservation API') {
      const created = await api('post', '/study/drafts', cookie)
        .send({ goal, level: 'intermediate' })
        .expect(201);

      return created.body.workspaceId as string;
    }

    // Skips ingestion: the row is inserted as ready.
    async function readySource(userId: string, workspaceId: string) {
      const id = randomUUID();

      await db.sourceDocument.create({
        data: {
          id,
          workspaceId,
          uploadedByUserId: userId,
          bucket: storage.bucket,
          objectKey: `documents/${id}/original.md`,
          filename: 'conventions.md',
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

      return id;
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

      const module = await Test.createTestingModule({ imports: [AppModule] })
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
          factory: (prisma: PrismaService, sources: SourceService) =>
            new ExecutionService(
              new PrismaExecutionRepository(
                prisma,
                undefined,
                new PrismaAttemptProgression(),
                new PrismaRoadmapGeneration(),
              ),
              queue,
              new ParserSyntaxChecker(),
              new SourceServiceCatalog(sources),
            ),
        })
        .compile();

      app = module.createNestApplication();
      configureHttp(app);
      await app.init();

      db = module.get(PrismaService);
      executions = module.get(ExecutionService);
      vi.spyOn(
        module.get(ExecutionStreamService),
        'broadcast',
      ).mockResolvedValue(undefined);
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

    it('authorizes drafts, validates the goal, caps active drafts and keeps them out of study', async () => {
      const alice = await learner();
      const bob = await learner();

      await api('post', '/study/drafts')
        .send({ goal: 'x'.repeat(20), level: 'beginner' })
        .expect(401);
      await api('post', '/study/drafts', alice.cookie)
        .send({ goal: 'short', level: 'beginner' })
        .expect(400);
      await api('post', '/study/drafts', alice.cookie)
        .send({ goal: 'A valid learning goal', level: 'expert' })
        .expect(400);

      const workspaceId = await draft(alice.cookie);

      await api('get', `/study/drafts/${workspaceId}`, bob.cookie).expect(404);
      await api('delete', `/study/drafts/${workspaceId}`, bob.cookie)
        .send({})
        .expect(404);
      await generate(bob.cookie, workspaceId).expect(404);

      // A draft workspace has no roadmap, so it cannot be studied or evaluated yet.
      await api('get', `/study/workspaces/${workspaceId}`, alice.cookie).expect(
        404,
      );
      await api('post', `/executions/workspaces/${workspaceId}`, alice.cookie)
        .send({
          requestKey: randomUUID(),
          revision: 0,
          kind: 'chat',
          prompt: 'Hi',
        })
        .expect(409);

      await draft(alice.cookie);
      await draft(alice.cookie);
      await api('post', '/study/drafts', alice.cookie)
        .send({ goal: 'A fourth learning goal', level: 'beginner' })
        .expect(409);

      const listed = await api('get', '/study/drafts', alice.cookie).expect(
        200,
      );
      const others = await api('get', '/study/drafts', bob.cookie).expect(200);

      expect(listed.body).toHaveLength(3);
      expect(others.body).toEqual([]);
    });

    it('generates once, consolidates a private roadmap under redelivery and binds the draft workspace', async () => {
      const alice = await learner();
      const bob = await learner();
      const workspaceId = await draft(alice.cookie);
      const sourceId = await readySource(alice.userId, workspaceId);
      const requestKey = randomUUID();

      const started = await generate(
        alice.cookie,
        workspaceId,
        requestKey,
      ).expect(201);
      const replay = await generate(
        alice.cookie,
        workspaceId,
        requestKey,
      ).expect(201);
      const executionId = started.body.id as string;

      expect(replay.body.id).toBe(executionId);
      expect(started.body).toMatchObject({
        kind: 'generation',
        status: 'queued',
      });
      expect(started.body.reserved).toBe(
        GENERATION_ATTEMPT_BUDGET * MAX_ATTEMPTS,
      );
      await generate(alice.cookie, workspaceId).expect(409);

      const record = await db.execution.findUniqueOrThrow({
        where: { id: executionId },
      });

      expect(record.input).toMatchObject({
        kind: 'generation',
        goal: 'Build a reservation API',
        level: 'intermediate',
        sources: [{ id: sourceId, filename: 'conventions.md' }],
      });

      const generating = await api(
        'get',
        `/study/drafts/${workspaceId}`,
        alice.cookie,
      ).expect(200);

      expect(generating.body).toMatchObject({
        status: 'generating',
        executionId,
      });

      const claim = await executions.claim(executionId);
      const event = completed(
        executionId,
        claim.lease!,
        candidate(sourceId, randomUUID()),
      );

      await executions.accept(event);
      await executions.accept(event);

      const generated = await api(
        'get',
        `/study/drafts/${workspaceId}`,
        alice.cookie,
      ).expect(200);
      const authored = await db.roadmap.findMany({
        where: { authorUserId: alice.userId },
      });

      expect(authored).toHaveLength(1);
      expect(authored[0].authorName).toBe(GENERATED_AUTHOR_NAME);
      expect(generated.body).toMatchObject({
        status: 'generated',
        failure: null,
        consulted: [{ id: sourceId, filename: 'conventions.md' }],
        roadmap: { id: authored[0].id },
      });
      expect(generated.body.evidence).toEqual([
        expect.objectContaining({
          stepId: 'domain-rules',
          sourceId,
          cite: 'S1',
        }),
      ]);
      // Evidence is private to the draft, never part of the publishable definition.
      expect(authored[0].definition).not.toHaveProperty('evidence');

      const workspace = await db.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
      });

      expect(workspace).toMatchObject({
        roadmapId: authored[0].id,
        files: { 'src/reservation.ts': 'export {};\n' },
        revision: 1,
      });
      await expect(
        db.workspace.update({
          where: { id: workspaceId },
          data: { roadmapId: null },
        }),
      ).rejects.toThrow();

      const aliceRoadmaps = await api(
        'get',
        '/study/roadmaps',
        alice.cookie,
      ).expect(200);
      const bobRoadmaps = await api(
        'get',
        '/study/roadmaps',
        bob.cookie,
      ).expect(200);
      const aliceIds = aliceRoadmaps.body.map(
        (item: { roadmap: { id: string } }) => item.roadmap.id,
      );
      const bobIds = bobRoadmaps.body.map(
        (item: { roadmap: { id: string } }) => item.roadmap.id,
      );

      expect(aliceIds).toContain(authored[0].id);
      expect(bobIds).not.toContain(authored[0].id);
      await api('post', `/study/roadmaps/${authored[0].id}/start`, bob.cookie)
        .send({})
        .expect(404);

      // Starting resumes the draft workspace, with the sources uploaded before generation.
      const studied = await api(
        'post',
        `/study/roadmaps/${authored[0].id}/start`,
        alice.cookie,
      )
        .send({})
        .expect(200);
      const sources = await api(
        'get',
        `/study/workspaces/${workspaceId}/sources`,
        alice.cookie,
      ).expect(200);
      const drafts = await api('get', '/study/drafts', alice.cookie).expect(
        200,
      );

      expect(studied.body.id).toBe(workspaceId);
      expect(sources.body).toEqual([
        expect.objectContaining({ id: sourceId, status: 'ready' }),
      ]);
      expect(drafts.body).toEqual([]);
      await generate(alice.cookie, workspaceId).expect(409);
    });

    it('fails invalid output without a roadmap, refunds the reservation and allows a retry', async () => {
      const alice = await learner();
      const workspaceId = await draft(alice.cookie);

      // Concurrent clicks with different keys: the draft lock admits exactly one.
      const racing = await Promise.all([
        generate(alice.cookie, workspaceId),
        generate(alice.cookie, workspaceId),
        generate(alice.cookie, workspaceId),
      ]);
      const statuses = racing
        .map((response) => response.status)
        .sort((a, b) => a - b);
      const started = racing.find((response) => response.status === 201)!;

      expect(statuses).toEqual([201, 409, 409]);
      expect((await executions.quota(alice.userId)).reserved).toBe(
        GENERATION_ATTEMPT_BUDGET * MAX_ATTEMPTS,
      );

      const claim = await executions.claim(started.body.id);
      const invalid = candidate(randomUUID(), randomUUID());
      invalid.definition.steps = invalid.definition.steps.slice(0, 2);

      await executions.accept(
        completed(started.body.id, claim.lease!, invalid),
      );

      const failed = await api(
        'get',
        `/study/drafts/${workspaceId}`,
        alice.cookie,
      ).expect(200);
      const workspace = await db.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
      });
      const quota = await executions.quota(alice.userId);

      expect(failed.body).toMatchObject({
        status: 'failed',
        roadmap: null,
        failure: { reason: 'invalid_output' },
      });
      expect(workspace.roadmapId).toBeNull();
      expect(
        await db.roadmap.count({ where: { authorUserId: alice.userId } }),
      ).toBe(0);
      expect(quota).toMatchObject({ reserved: 0, used: 4500 });

      const retried = await generate(alice.cookie, workspaceId).expect(201);
      const retrying = await api(
        'get',
        `/study/drafts/${workspaceId}`,
        alice.cookie,
      ).expect(200);

      expect(retrying.body).toMatchObject({
        status: 'generating',
        executionId: retried.body.id,
        failure: null,
      });
    });

    it('reopens a cancelled draft, and discarding deletes its sources and blocks new uploads', async () => {
      const alice = await learner();
      const workspaceId = await draft(alice.cookie);

      const started = await generate(alice.cookie, workspaceId).expect(201);

      await api('post', `/executions/${started.body.id}/cancel`, alice.cookie)
        .send({})
        .expect(201);

      const reopened = await api(
        'get',
        `/study/drafts/${workspaceId}`,
        alice.cookie,
      ).expect(200);

      expect(reopened.body).toMatchObject({
        status: 'open',
        failure: { reason: 'cancelled' },
      });

      const upload = await api(
        'post',
        `/study/workspaces/${workspaceId}/sources`,
        alice.cookie,
      )
        .send({ filename: 'notes.md', contentType: 'text/markdown', size: 42 })
        .expect(201);
      const sourceId = upload.body.source.id as string;

      await api('delete', `/study/drafts/${workspaceId}`, alice.cookie)
        .send({})
        .expect(200);

      const removed = await db.sourceDocument.findUniqueOrThrow({
        where: { id: sourceId },
      });

      expect(removed.status).toBe('deleted');
      expect(storage.deleted.some((key) => key.includes(sourceId))).toBe(true);
      await api(
        'post',
        `/study/workspaces/${workspaceId}/sources`,
        alice.cookie,
      )
        .send({ filename: 'late.md', contentType: 'text/markdown', size: 42 })
        .expect(404);
      await api('get', `/study/drafts/${workspaceId}`, alice.cookie).expect(
        404,
      );
      await generate(alice.cookie, workspaceId).expect(404);
      await api('delete', `/study/drafts/${workspaceId}`, alice.cookie)
        .send({})
        .expect(404);
    });
  },
);
