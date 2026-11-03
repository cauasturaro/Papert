import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { configureHttp } from '../src/http.js';
import { SourceService } from '../src/sources/application/source.service.js';
import { PrismaSourceRepository } from '../src/sources/infrastructure/prisma-source.repository.js';
import type { SourceStorage } from '../src/sources/domain/ports.js';
import { ParserSyntaxChecker } from '../src/analysis/infrastructure/parser-syntax-checker.js';
import { ExecutionService } from '../src/executions/application/execution.service.js';
import { PrismaExecutionRepository } from '../src/executions/infrastructure/prisma-execution.repository.js';
import { SourceServiceCatalog } from '../src/executions/infrastructure/source-catalog.js';

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
}

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Sources HTTP + PostgreSQL',
  () => {
    let app: INestApplication;
    let db: PrismaService;
    let sources: SourceService;

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

    function created(
      source: { id: string; format: string },
      sequencer: string,
    ) {
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
          factory: (prisma: PrismaService, sourceService: SourceService) =>
            new ExecutionService(
              new PrismaExecutionRepository(prisma),
              { publish: async () => {} },
              new ParserSyntaxChecker(),
              new SourceServiceCatalog(sourceService),
            ),
        })
        .overrideProvider(SourceService)
        .useFactory({
          inject: [PrismaService],
          factory: (prisma: PrismaService) =>
            new SourceService(new PrismaSourceRepository(prisma), storage),
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

    it('registers before upload, isolates workspaces and validates declarations', async () => {
      const alice = await student();
      const bob = await student();
      const pdf = {
        filename: 'architecture.pdf',
        contentType: 'application/pdf',
        size: 42,
      };

      await api('post', alice.base).send(pdf).expect(401);

      const registered = await api('post', alice.base, alice.cookie)
        .send(pdf)
        .expect(201);
      const row = await db.sourceDocument.findUniqueOrThrow({
        where: { id: registered.body.source.id },
      });

      expect(registered.body.source.status).toBe('awaiting_upload');
      expect(registered.body.upload).toMatchObject({
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
      });
      expect(row).toMatchObject({
        workspaceId: alice.workspaceId,
        uploadedByUserId: alice.userId,
        bucket: 'papert-sources',
        objectKey: `documents/${row.id}/original.pdf`,
      });

      await api('get', alice.base, bob.cookie).expect(404);
      await api('post', alice.base, bob.cookie).send(pdf).expect(404);
      await api('delete', `${alice.base}/${row.id}`, bob.cookie)
        .send({})
        .expect(404);
      await api(
        'get',
        '/study/workspaces/not-a-uuid/sources',
        alice.cookie,
      ).expect(404);

      const invalid = [
        { ...pdf, filename: 'script.exe' },
        { ...pdf, contentType: 'text/html' },
        { ...pdf, size: 15 * 1024 * 1024 + 1 },
        { ...pdf, workspaceId: bob.workspaceId },
      ];

      for (const body of invalid) {
        await api('post', alice.base, alice.cookie).send(body).expect(400);
      }

      const listed = await api('get', alice.base, alice.cookie).expect(200);
      const bobListed = await api('get', bob.base, bob.cookie).expect(200);

      expect(listed.body.map((item: { id: string }) => item.id)).toEqual([
        row.id,
      ]);
      expect(bobListed.body).toEqual([]);
    });

    it('accepts only registered, current object versions from ingestion', async () => {
      const alice = await student();
      const registered = await api('post', alice.base, alice.cookie)
        .send({ filename: 'notes.md', contentType: '', size: 42 })
        .expect(201);
      const source = registered.body.source;

      const forged = await sources.control({
        ...created(source, '00A1'),
        key: `documents/${randomUUID()}/original.md`,
      });
      const otherBucket = await sources.control({
        ...created(source, '00A1'),
        bucket: 'attacker-bucket',
      });
      const otherFormat = await sources.control({
        ...created(source, '00A1'),
        key: `documents/${source.id}/original.pdf`,
      });

      expect(forged).toMatchObject({
        outcome: 'reject',
        reason: 'unregistered',
      });
      expect(otherBucket).toMatchObject({ outcome: 'reject' });
      expect(otherFormat).toMatchObject({ outcome: 'reject' });
      await expect(sources.control({ action: 'begin' })).rejects.toThrow();

      const first = await sources.control(created(source, '00A1'));
      const redelivered = await sources.control(created(source, '00A1'));

      expect(first).toMatchObject({
        outcome: 'process',
        documentId: source.id,
        workspaceId: alice.workspaceId,
        format: 'md',
      });
      expect(redelivered).toMatchObject({ outcome: 'process' });

      // A newer version supersedes the first; results for the old one are ignored.
      await sources.control(created(source, '00B2'));

      const lateOld = await sources.control(completed(source.id, '00A1'));
      const lateOldBegin = await sources.control(created(source, '00A1'));
      const current = await sources.control(completed(source.id, '00B2'));
      const duplicate = await sources.control(created(source, '00B2'));
      const lateFailure = await sources.control({
        action: 'fail',
        documentId: source.id,
        versionId: 'v-00B2',
        sequencer: '00B2',
        code: 'processing_failed',
      });

      expect(lateOld).toEqual({ accepted: false, deleted: false });
      expect(lateOldBegin).toMatchObject({ outcome: 'stale' });
      expect(current).toEqual({ accepted: true, deleted: false });
      expect(duplicate).toMatchObject({ outcome: 'duplicate' });
      expect(lateFailure).toEqual({ accepted: false, deleted: false });

      const listed = await api('get', alice.base, alice.cookie).expect(200);

      expect(listed.body[0]).toMatchObject({
        status: 'ready',
        chunkCount: 3,
        pageCount: 2,
        error: null,
      });
    });

    it('records explicit failures, tampered sizes and deletions during ingestion', async () => {
      const alice = await student();
      const failing = await api('post', alice.base, alice.cookie)
        .send({
          filename: 'scan.pdf',
          contentType: 'application/pdf',
          size: 42,
        })
        .expect(201);
      const resized = await api('post', alice.base, alice.cookie)
        .send({
          filename: 'size.pdf',
          contentType: 'application/pdf',
          size: 42,
        })
        .expect(201);
      const deleting = await api('post', alice.base, alice.cookie)
        .send({ filename: 'gone.docx', contentType: '', size: 42 })
        .expect(201);

      await sources.control(created(failing.body.source, '0001'));
      const failed = await sources.control({
        action: 'fail',
        documentId: failing.body.source.id,
        versionId: 'v-0001',
        sequencer: '0001',
        code: 'no_text',
      });
      const tampered = await sources.control({
        ...created(resized.body.source, '0001'),
        size: 43,
      });

      expect(failed).toEqual({ accepted: true, deleted: false });
      expect(tampered).toMatchObject({
        outcome: 'invalid',
        reason: 'invalid_upload',
        documentId: resized.body.source.id,
        workspaceId: alice.workspaceId,
      });

      await sources.control(created(deleting.body.source, '0001'));
      await api(
        'delete',
        `${alice.base}/${deleting.body.source.id}`,
        alice.cookie,
      )
        .send({})
        .expect(204);

      const afterDelete = await sources.control(
        completed(deleting.body.source.id, '0001'),
      );
      const lateEvent = await sources.control(
        created(deleting.body.source, '0002'),
      );
      const removal = await sources.control({
        action: 'removal',
        bucket: 'papert-sources',
        key: `documents/${deleting.body.source.id}/original.docx`,
      });

      expect(afterDelete).toEqual({ accepted: false, deleted: true });
      expect(lateEvent).toMatchObject({
        outcome: 'deleted',
        documentId: deleting.body.source.id,
        workspaceId: alice.workspaceId,
      });
      expect(removal).toEqual({
        documentId: deleting.body.source.id,
        workspaceId: alice.workspaceId,
        deleted: true,
      });
      expect(storage.deleted).toContain(
        `documents/${deleting.body.source.id}/original.docx`,
      );

      const listed = await api('get', alice.base, alice.cookie).expect(200);
      const states = Object.fromEntries(
        listed.body.map(
          (item: {
            filename: string;
            status: string;
            error: { code: string } | null;
          }) => [item.filename, `${item.status}:${item.error?.code ?? ''}`],
        ),
      );

      expect(states).toEqual({
        'scan.pdf': 'failed:no_text',
        'size.pdf': 'failed:invalid_upload',
      });
      await api(
        'delete',
        `${alice.base}/${deleting.body.source.id}`,
        alice.cookie,
      )
        .send({})
        .expect(404);
    });

    it('enforces workspace limits, expires uploads and retries failed purges', async () => {
      const alice = await student();
      const body = { filename: 'n.md', contentType: 'text/markdown', size: 1 };

      for (let index = 0; index < 20; index += 1) {
        await api('post', alice.base, alice.cookie).send(body).expect(201);
      }

      await api('post', alice.base, alice.cookie).send(body).expect(409);

      const [newest] = (await api('get', alice.base, alice.cookie).expect(200))
        .body;

      storage.failDeletes = true;
      await api('delete', `${alice.base}/${newest.id}`, alice.cookie)
        .send({})
        .expect(204);

      const unpurged = await db.sourceDocument.findUniqueOrThrow({
        where: { id: newest.id },
      });

      expect(unpurged.purgedAt).toBeNull();

      await db.sourceDocument.updateMany({
        where: { workspaceId: alice.workspaceId, status: 'awaiting_upload' },
        data: { uploadExpiresAt: new Date(Date.now() - 1000) },
      });
      storage.failDeletes = false;

      const swept = await sources.maintenance();
      const purged = await db.sourceDocument.findUniqueOrThrow({
        where: { id: newest.id },
      });
      const expired = await db.sourceDocument.count({
        where: { workspaceId: alice.workspaceId, errorCode: 'upload_expired' },
      });

      expect(swept.expired).toBeGreaterThanOrEqual(19);
      expect(purged.purgedAt).not.toBeNull();
      expect(expired).toBe(19);

      // Ten more fill the 30-per-day registration allowance after deleting old sources.
      await db.sourceDocument.updateMany({
        where: { workspaceId: alice.workspaceId, status: { not: 'deleted' } },
        data: {
          status: 'deleted',
          deletedAt: new Date(),
          purgedAt: new Date(),
        },
      });

      for (let index = 0; index < 10; index += 1) {
        await api('post', alice.base, alice.cookie).send(body).expect(201);
      }

      await api('post', alice.base, alice.cookie).send(body).expect(429);
    });

    it('lets the tutor search only ready sources and validates @ mentions', async () => {
      const alice = await student();
      const ready = await api('post', alice.base, alice.cookie)
        .send({ filename: 'api.pdf', contentType: 'application/pdf', size: 42 })
        .expect(201);
      const pending = await api('post', alice.base, alice.cookie)
        .send({ filename: 'draft.md', contentType: '', size: 42 })
        .expect(201);

      await sources.control(created(ready.body.source, '0001'));
      await sources.control(completed(ready.body.source.id, '0001'));

      const chat = (sourceIds: string[]) => ({
        requestKey: randomUUID(),
        revision: 0,
        kind: 'chat',
        mode: 'doubt',
        prompt: 'Give me a request example from @api.pdf',
        sourceIds,
      });
      const executions = `/executions/workspaces/${alice.workspaceId}`;

      const accepted = await api('post', executions, alice.cookie)
        .send(chat([ready.body.source.id]))
        .expect(201);
      const stored = await db.execution.findUniqueOrThrow({
        where: { id: accepted.body.id },
      });

      expect(stored.input).toMatchObject({
        workspaceId: alice.workspaceId,
        sourceIds: [ready.body.source.id],
        sources: [
          { id: ready.body.source.id, filename: 'api.pdf', format: 'pdf' },
        ],
      });

      // A completed exchange becomes conversation context for the next message.
      await db.execution.update({
        where: { id: accepted.body.id },
        data: { status: 'completed', text: 'The example is on page 4.' },
      });

      const followUp = await api('post', executions, alice.cookie)
        .send({
          ...chat([]),
          sourceIds: undefined,
          prompt: 'Show me that example',
        })
        .expect(201);
      const followUpRow = await db.execution.findUniqueOrThrow({
        where: { id: followUp.body.id },
      });

      expect(followUpRow.input).toMatchObject({
        recentTurns: [
          {
            prompt: 'Give me a request example from @api.pdf',
            answer: 'The example is on page 4.',
          },
        ],
      });

      await api('post', executions, alice.cookie)
        .send(chat([pending.body.source.id]))
        .expect(400);
      await api('post', executions, alice.cookie)
        .send(chat([randomUUID()]))
        .expect(400);
      await api('post', executions, alice.cookie)
        .send({ ...chat([ready.body.source.id]), mode: undefined })
        .expect(400);
    });

    it('reindexes only finished sources whose upload was valid', async () => {
      const alice = await student();
      const body = {
        filename: 'guide.pdf',
        contentType: 'application/pdf',
        size: 42,
      };
      const ready = await api('post', alice.base, alice.cookie)
        .send(body)
        .expect(201);
      const pending = await api('post', alice.base, alice.cookie)
        .send(body)
        .expect(201);
      const tampered = await api('post', alice.base, alice.cookie)
        .send(body)
        .expect(201);

      await sources.control(created(ready.body.source, '0001'));
      await sources.control(completed(ready.body.source.id, '0001'));
      await sources.control({
        ...created(tampered.body.source, '0001'),
        size: 43,
      });

      const reindexed = await sources.control({
        action: 'reindex',
        documentId: ready.body.source.id,
      });
      const notUploaded = await sources.control({
        action: 'reindex',
        documentId: pending.body.source.id,
      });
      const invalid = await sources.control({
        action: 'reindex',
        documentId: tampered.body.source.id,
      });

      expect(reindexed).toMatchObject({
        outcome: 'process',
        documentId: ready.body.source.id,
        workspaceId: alice.workspaceId,
        key: `documents/${ready.body.source.id}/original.pdf`,
        versionId: 'v-0001',
        sequencer: '0001',
      });
      expect(notUploaded).toMatchObject({ outcome: 'skip' });
      expect(invalid).toMatchObject({ outcome: 'skip' });

      // The current version can complete again after re-extraction.
      const again = await sources.control(
        completed(ready.body.source.id, '0001'),
      );

      expect(again).toEqual({ accepted: true, deleted: false });
    });
  },
);
