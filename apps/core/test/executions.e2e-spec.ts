import { PrismaExecutionRepository } from '../src/executions/infrastructure/prisma-execution.repository.js';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { ExecutionService } from '../src/executions/application/execution.service.js';
import { ExecutionStream } from '../src/executions/infrastructure/aws-execution.js';
import { configureHttp } from '../src/http.js';

const enabled = !!process.env.AUTH_TEST_DATABASE_URL;

describe.skipIf(!enabled)('Executions HTTP + PostgreSQL', () => {
  let app: INestApplication;
  let db: PrismaService;
  let service: ExecutionService;
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

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ExecutionService)
      .useFactory({
        inject: [PrismaService],
        factory: (database: PrismaService) =>
          new ExecutionService(
            new PrismaExecutionRepository(database, () => now),
            queue,
          ),
      })
      .compile();
    app = module.createNestApplication();
    configureHttp(app);
    await app.init();

    db = module.get(PrismaService);
    service = module.get(ExecutionService);
    vi.spyOn(module.get(ExecutionStream), 'broadcast').mockResolvedValue(
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

  it('authorizes all operations, validates input and captures only saved server context', async () => {
    const alice = await student();
    const bob = await student();
    const path = `workspaces/${alice.workspaceId}`;
    const body = payload();

    await api('post', path).send(body).expect(401);
    await api('post', path, bob.cookie).send(body).expect(404);
    await api('post', path, alice.cookie)
      .set('Origin', 'https://attacker.test')
      .send(body)
      .expect(403);
    await api('post', path, alice.cookie)
      .send({ ...body, files: {}, status: 'completed' })
      .expect(400);
    await api('post', path, alice.cookie)
      .send({ ...body, revision: 99 })
      .expect(409);
    await api('post', path, alice.cookie)
      .send({ ...body, kind: 'embedding' })
      .expect(400);

    const created = await api('post', path, alice.cookie)
      .send(body)
      .expect(201);
    const id = created.body.id;
    const record = await db.execution.findUniqueOrThrow({ where: { id } });
    const workspace = await db.workspace.findUniqueOrThrow({
      where: { id: alice.workspaceId },
      include: { session: true },
    });

    expect(record.input).toMatchObject({
      files: workspace.files,
      sessionId: workspace.session!.id,
      stepId: 'validate-input',
    });
    expect(queue.publish).toHaveBeenCalledTimes(1);

    await api('get', id, bob.cookie).expect(404);
    await api('post', `${id}/cancel`, bob.cookie).send({}).expect(404);
    await api('post', `${id}/ticket`, bob.cookie).send({}).expect(404);
    await api('get', path, bob.cookie).expect(404);

    const resumed = await api('get', id, alice.cookie).expect(200);
    expect(resumed.headers['cache-control']).toBe('no-store');
    expect(resumed.body).not.toHaveProperty('input');
    expect(resumed.body).not.toHaveProperty('lease');

    await api('post', path, alice.cookie)
      .send({ ...body, prompt: 'different' })
      .expect(409);
  });

  it('serializes concurrent reservations and idempotency without overspending', async () => {
    const alice = await student();
    const same = payload();
    const duplicates = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.create(alice.userId, alice.workspaceId, same),
      ),
    );

    expect(new Set(duplicates.map((job) => job.id)).size).toBe(1);
    expect((await service.quota(alice.userId)).reserved).toBe(3000);

    const submissions = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        service.create(alice.userId, alice.workspaceId, payload()),
      ),
    );
    expect(
      submissions.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(9);
    expect(await service.quota(alice.userId)).toMatchObject({
      used: 0,
      reserved: 30000,
    });
    expect(await db.execution.count({ where: { userId: alice.userId } })).toBe(
      10,
    );

    now = new Date('2026-11-02T12:01:01Z');
    const published = queue.publish.mock.calls.length;
    await expect(
      service.create(alice.userId, alice.workspaceId, payload()),
    ).rejects.toThrow('quota');
    expect(queue.publish.mock.calls).toHaveLength(published);

    now = new Date('2026-11-03T00:00:01Z');
    expect(await service.quota(alice.userId)).toMatchObject({
      period: '2026-11-03',
      reserved: 0,
    });
    await service.create(alice.userId, alice.workspaceId, payload());
    expect((await service.quota(alice.userId)).reserved).toBe(3000);
  });

  it('recovers the persist/publish gap and tolerates delivery after publish acknowledgement is lost', async () => {
    const alice = await student();
    queue.publish.mockRejectedValueOnce(new Error('SQS unavailable'));

    const created = await service.create(
      alice.userId,
      alice.workspaceId,
      payload(),
    );
    expect(
      (await db.execution.findUniqueOrThrow({ where: { id: created.id } }))
        .publishedAt,
    ).toBeNull();

    const recovered = await service.sweep();
    expect(recovered.published).toBe(1);
    expect(queue.publish).toHaveBeenCalledTimes(2);

    const first = await service.claim(created.id);
    const duplicate = await service.claim(created.id);
    expect(first.status).toBe('running');
    expect(duplicate.status).toBe('busy');
    expect((await service.quota(alice.userId)).used).toBe(1000);
  });

  it('persists incremental snapshots, fences old attempts and settles a result once across duplicate/out-of-order deliveries', async () => {
    const alice = await student();
    const created = await service.create(
      alice.userId,
      alice.workspaceId,
      payload(),
    );
    const first = await service.claim(created.id);

    const progress = await service.accept(
      event(created.id, first.lease!, 1, 'running', 0),
    );
    expect(progress.status).toBe('running');
    expect(progress.firstEventAt).not.toBeNull();
    expect(progress.finishedAt).toBeNull();

    now = new Date(now.getTime() + 61000);
    const retry = await service.claim(created.id);
    await service.accept(event(created.id, first.lease!, 99));
    expect((await service.owned(alice.userId, created.id)).status).toBe(
      'running',
    );

    const final = await service.accept(event(created.id, retry.lease!, 3));
    const duplicate = await service.accept(event(created.id, retry.lease!, 3));
    const older = await service.accept(
      event(created.id, retry.lease!, 2, 'running'),
    );

    expect(duplicate).toEqual(final);
    expect(older).toEqual(final);
    expect(final).toMatchObject({
      status: 'completed',
      charged: 100,
      reserved: 0,
      text: 'Snapshot 3',
    });
    expect(await service.quota(alice.userId)).toMatchObject({
      used: 100,
      reserved: 0,
    });

    const restarted = new ExecutionService(
      new PrismaExecutionRepository(db, () => now),
      queue,
    );
    expect(
      restarted.snapshot(await restarted.owned(alice.userId, created.id)),
    ).toEqual(final);
    expect(
      (
        await db.workspace.findUniqueOrThrow({
          where: { id: alice.workspaceId },
        })
      ).currentStep,
    ).toBe(0);
  });

  it('cancels before and during work, settles known late usage, and never publishes late text', async () => {
    const alice = await student();
    const queued = await service.create(
      alice.userId,
      alice.workspaceId,
      payload(),
    );
    await service.cancel(alice.userId, queued.id);
    expect((await service.claim(queued.id)).status).toBe('cancelled');
    expect(await service.quota(alice.userId)).toMatchObject({
      used: 0,
      reserved: 0,
    });

    const running = await service.create(
      alice.userId,
      alice.workspaceId,
      payload(),
    );
    const claim = await service.claim(running.id);
    await service.cancel(alice.userId, running.id);
    expect(await service.active(running.id, claim.lease!)).toBe(false);

    const late = event(running.id, claim.lease!, 100, 'completed', 10);
    await service.accept(late);
    await service.accept(late);
    expect(await service.quota(alice.userId)).toMatchObject({
      used: 10,
      reserved: 0,
    });
    expect(await service.owned(alice.userId, running.id)).toMatchObject({
      status: 'cancelled',
      text: '',
    });
  });

  it('bounds retries and ends permanent failure, while maintenance releases timed-out reservations', async () => {
    const alice = await student();
    const job = await service.create(
      alice.userId,
      alice.workspaceId,
      payload(),
    );

    for (let attempt = 0; attempt < 3; attempt++) {
      const claim = await service.claim(job.id);
      await service.failed(job.id, claim.lease!);
    }

    expect((await service.claim(job.id)).status).toBe('failed');
    expect(await service.quota(alice.userId)).toMatchObject({
      used: 3000,
      reserved: 0,
    });

    const hanging = await service.create(
      alice.userId,
      alice.workspaceId,
      payload(),
    );
    const claim = await service.claim(hanging.id);
    now = new Date(now.getTime() + 16 * 60000);
    await service.sweep();

    expect(await service.owned(alice.userId, hanging.id)).toMatchObject({
      status: 'timed_out',
      charged: 1000,
      reserved: 0,
    });
    await service.accept(event(hanging.id, claim.lease!, 100, 'completed', 0));
    expect(await service.quota(alice.userId)).toMatchObject({
      used: 3000,
      reserved: 0,
    });
  });

  it('authorizes tutor context, solution eligibility and per-execution token budgets', async () => {
    const alice = await student();
    const path = `workspaces/${alice.workspaceId}`;
    const tutor = {
      ...payload(),
      mode: 'doubt',
      effort: 'high',
      activeFile: 'src/service.ts',
      selection: { start: 0, end: 5 },
    };

    await api('post', path, alice.cookie)
      .send({ ...tutor, solutionAllowed: true })
      .expect(400);
    await api('post', path, alice.cookie)
      .send({ ...tutor, activeFile: '../.env' })
      .expect(400);
    await api('post', path, alice.cookie)
      .send({ ...tutor, selection: { start: 0, end: 9999 } })
      .expect(400);
    await api('post', path, alice.cookie)
      .send({ ...tutor, kind: 'analysis' })
      .expect(400);
    await api('post', path, alice.cookie)
      .send({ ...tutor, mode: 'solution' })
      .expect(403);

    const created = await api('post', path, alice.cookie)
      .send(tutor)
      .expect(201);
    const claim = await service.claim(created.body.id);

    expect(claim.budget).toBe(8000);
    expect(claim.input).toMatchObject({
      activeFile: 'src/service.ts',
      selection: { start: 0, end: 5 },
      mode: 'doubt',
      effort: 'high',
      solutionAllowed: false,
      stepTitle: 'Validate the request',
    });
    expect(await service.quota(alice.userId)).toMatchObject({
      used: 8000,
      reserved: 16000,
    });

    await api('post', path, alice.cookie)
      .send({ ...tutor, effort: 'low' })
      .expect(409);
    await expect(
      service.accept(
        event(created.body.id, claim.lease!, 100, 'completed', 8001),
      ),
    ).rejects.toThrow();

    await service.accept(
      event(created.body.id, claim.lease!, 100, 'completed', 2500),
    );
    expect(await service.quota(alice.userId)).toMatchObject({
      used: 2500,
      reserved: 0,
    });

    const studyPath = `/study/workspaces/${alice.workspaceId}`;
    for (let revision = 0; revision < 3; revision++) {
      const saved = await request(app.getHttpServer())
        .put(studyPath)
        .set('Cookie', alice.cookie)
        .set('Origin', origin)
        .send({
          revision,
          notes: '',
          files: { 'src/service.ts': `// Attempt ${revision + 1}\n` },
        })
        .expect(200);

      await request(app.getHttpServer())
        .post(`${studyPath}/attempts`)
        .set('Cookie', alice.cookie)
        .set('Origin', origin)
        .send({ revision: saved.body.revision, stepId: 'validate-input' })
        .expect(201);
    }

    const allowed = await api('post', path, alice.cookie)
      .send({
        ...tutor,
        revision: 3,
        requestKey: randomUUID(),
        mode: 'solution',
      })
      .expect(201);
    const allowedClaim = await service.claim(allowed.body.id);

    expect(allowedClaim.input).toMatchObject({
      mode: 'solution',
      solutionAllowed: true,
    });
    await service.accept(
      event(allowed.body.id, allowedClaim.lease!, 100, 'completed', 100),
    );

    const legacy = await service.create(alice.userId, alice.workspaceId, {
      ...payload(),
      revision: 3,
    });
    const legacyClaim = await service.claim(legacy.id);

    expect(legacyClaim.budget).toBe(1000);
    await expect(
      service.accept(
        event(legacy.id, legacyClaim.lease!, 100, 'completed', 1001),
      ),
    ).rejects.toThrow('budget');
    expect(
      (
        await db.workspace.findUniqueOrThrow({
          where: { id: alice.workspaceId },
        })
      ).currentStep,
    ).toBe(0);
  });
});
