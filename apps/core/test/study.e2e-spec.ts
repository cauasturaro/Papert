import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { configureHttp } from '../src/http.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Study HTTP + PostgreSQL',
  () => {
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
          password: 'a long study passphrase',
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

    it('isolates students, protects immutable definitions and snapshots, and resumes after a full application restart', async () => {
      const alice = await register();
      const bob = await register();

      await api('get', `${base}/roadmaps/fixture`).expect(401);

      const original = (
        await api('get', `${base}/roadmaps/fixture`, alice).expect(200)
      ).body;

      const startPath = `${base}/roadmaps/${original.id}/start`;
      const first = (await api('post', startPath, alice).send({}).expect(200))
        .body;
      const second = (await api('post', startPath, bob).send({}).expect(200))
        .body;
      const path = `${base}/workspaces/${first.id}`;

      expect(first.id).not.toBe(second.id);
      expect(first.session.id).not.toBe(second.session.id);
      expect(first.roadmap.id).toBe(second.roadmap.id);
      expect(first.roadmap.authorName).toBe('Papert');

      await api('get', path, bob).expect(404);
      await api('put', path, bob)
        .send({ revision: 0, notes: 'forged', files: {} })
        .expect(404);
      await api('post', `${path}/attempts`, bob)
        .send({ revision: 0, stepId: 'validate-input' })
        .expect(404);
      await api('get', `${path}/steps/validate-input`, bob).expect(404);

      await api('get', `${path}/steps/separate-rules`, alice).expect(403);
      await api('post', `${path}/attempts`, alice)
        .send({ revision: 0, stepId: 'separate-rules' })
        .expect(403);
      await api('post', startPath, alice).send({ currentStep: 1 }).expect(400);

      for (const method of ['put', 'patch', 'delete'] as const) {
        await api(method, `${base}/roadmaps/${original.id}`, alice)
          .send({ authorName: 'forged', definition: {} })
          .expect(405);
      }

      await expect(
        db.roadmap.update({
          where: { id: original.id },
          data: { authorName: 'forged' },
        }),
      ).rejects.toThrow('immutable');
      await expect(
        db.roadmap.delete({ where: { id: original.id } }),
      ).rejects.toThrow('immutable');

      const draft = {
        revision: 0,
        notes: 'Remember to validate input.',
        files: {
          'src/service.ts':
            'export const greet = (name: string) => `Hello ${name}`;\n',
        },
      };

      for (const field of [
        'currentStep',
        'approved',
        'status',
        'userId',
        'roadmapId',
      ]) {
        await api('put', path, alice)
          .send({ ...draft, [field]: 1 })
          .expect(400);
      }

      await api('put', path, alice)
        .set('Origin', 'https://attacker.example')
        .send(draft)
        .expect(403);

      const saved = (await api('put', path, alice).send(draft).expect(200))
        .body;

      expect(saved.revision).toBe(1);
      expect(saved.currentStep).toBe(0);
      expect(saved.roadmap).toEqual(original);

      await api('put', path, alice).send(draft).expect(409);

      await api('post', `${path}/attempts`, alice)
        .send({
          revision: 1,
          stepId: 'validate-input',
          result: { approved: true },
        })
        .expect(400);

      const attempt = (
        await api('post', `${path}/attempts`, alice)
          .send({ revision: 1, stepId: 'validate-input' })
          .expect(201)
      ).body;

      const repeated = (
        await api('post', `${path}/attempts`, alice)
          .send({ revision: 1, stepId: 'validate-input' })
          .expect(201)
      ).body;

      expect(repeated.id).toBe(attempt.id);
      expect(attempt.files).toEqual(draft.files);
      expect(attempt.challenge).toEqual(original.definition.steps[0].challenge);
      expect(attempt.result).toEqual({ status: 'not_evaluated' });

      await expect(
        db.studyAttempt.update({
          where: { id: attempt.id },
          data: { files: {} },
        }),
      ).rejects.toThrow('immutable');

      await api('patch', `${path}/attempts/${attempt.id}`, alice)
        .send({ result: { approved: true } })
        .expect(404);

      await api('put', path, alice)
        .send({
          revision: 1,
          notes: 'New notes',
          files: { 'src/service.ts': 'new code' },
        })
        .expect(200);

      // Arrange trusted progress without introducing a public approval endpoint.
      await db.workspace.update({
        where: { id: first.id },
        data: { currentStep: 1 },
      });

      await app.close();
      await boot();

      const resumed = (await api('post', startPath, alice).send({}).expect(200))
        .body;

      expect(resumed.id).toBe(first.id);
      expect(resumed.session.id).toBe(first.session.id);
      expect(resumed.notes).toBe('New notes');
      expect(resumed.files['src/service.ts']).toBe('new code');
      expect(resumed.currentStep).toBe(1);
      expect(resumed.attempts).toHaveLength(1);
      expect(resumed.attempts[0]).toEqual(attempt);

      const other = (
        await api('get', `${base}/workspaces/${second.id}`, bob).expect(200)
      ).body;

      expect(other.revision).toBe(0);
      expect(other.currentStep).toBe(0);
      expect(other.notes).toBe('');
      expect(other.attempts).toEqual([]);

      expect(
        (await api('get', `${base}/roadmaps/fixture`, alice).expect(200)).body,
      ).toEqual(original);

      expect((await api('get', path, alice)).headers['cache-control']).toBe(
        'no-store',
      );
    });

    it('serializes concurrent starts, saves and attempt snapshots without losing a revision', async () => {
      const cookie = await register();

      const original = (
        await api('get', `${base}/roadmaps/fixture`, cookie).expect(200)
      ).body;

      const startPath = `${base}/roadmaps/${original.id}/start`;
      const starts = await Promise.all(
        Array.from({ length: 4 }, () =>
          api('post', startPath, cookie).send({}).expect(200),
        ),
      );

      expect(new Set(starts.map((response) => response.body.id)).size).toBe(1);

      const path = `${base}/workspaces/${starts[0].body.id}`;

      const saves = await Promise.all(
        ['first', 'second'].map((notes) =>
          api('put', path, cookie).send({
            revision: 0,
            notes,
            files: { 'src/service.ts': notes },
          }),
        ),
      );

      expect(
        saves.map((response) => response.status).sort((a, b) => a - b),
      ).toEqual([200, 409]);

      const winner = saves.find((response) => response.status === 200)!.body;

      const [snapshot] = await Promise.all([
        api('post', `${path}/attempts`, cookie).send({
          revision: 1,
          stepId: 'validate-input',
        }),
        api('put', path, cookie)
          .send({
            revision: 1,
            notes: 'latest',
            files: { 'src/service.ts': 'latest' },
          })
          .expect(200),
      ]);

      expect([201, 409]).toContain(snapshot.status);

      if (snapshot.status === 201) {
        expect(snapshot.body.files).toEqual(winner.files);
        expect(snapshot.body.revision).toBe(1);
      }

      const current = (await api('get', path, cookie).expect(200)).body;

      expect(current.files['src/service.ts']).toBe('latest');
      expect(current.revision).toBe(2);
      expect(current.currentStep).toBe(0);
    });
  },
);
