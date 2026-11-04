import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ParserSyntaxChecker } from '../src/analysis/infrastructure/parser-syntax-checker.js';
import { AppModule } from '../src/app.module.js';
import { ExecutionService } from '../src/executions/application/execution.service.js';
import { ExecutionStreamService } from '../src/executions/application/execution-stream.service.js';
import { PrismaExecutionRepository } from '../src/executions/infrastructure/prisma-execution-repository.js';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { PrismaAttemptProgression } from '../src/study/infrastructure/prisma-attempt-progression.js';
import { PrismaRoadmapGeneration } from '../src/study/infrastructure/prisma-roadmap-generation.js';
import { configureHttp } from '../src/http.js';

// These suites do not exercise workspace sources.
const noSources = { ready: async () => [] };

const enabled = !!process.env.AUTH_TEST_DATABASE_URL;

const FIRST_CRITERIA = ['valid-name', 'http-errors', 'greeting'];
const SECOND_CRITERIA = ['pure-function', 'boundary-validation'];

function met(ids: string[]) {
  return Object.fromEntries(ids.map((id) => [id, 'met' as const]));
}

describe.skipIf(!enabled)('Analysis, evaluation and progression', () => {
  let app: INestApplication;
  let db: PrismaService;
  let service: ExecutionService;
  const queue = { publish: vi.fn(async (_id: string) => {}) };
  const users: string[] = [];
  const origin = 'http://localhost:3000';

  function api(method: 'get' | 'post' | 'put', path: string, cookie: string) {
    return request(app.getHttpServer())
      [method](path)
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
    users.push(registered.body.user.id);

    const cookie = String(registered.headers['set-cookie'][0]).split(';')[0];
    const fixture = await api('get', '/study/roadmaps/fixture', cookie).expect(
      200,
    );
    const started = await api(
      'post',
      `/study/roadmaps/${fixture.body.id}/start`,
      cookie,
    )
      .send({})
      .expect(200);

    return { cookie, workspaceId: started.body.id as string };
  }

  async function save(
    cookie: string,
    workspaceId: string,
    files: Record<string, string>,
  ) {
    const current = await api(
      'get',
      `/study/workspaces/${workspaceId}`,
      cookie,
    ).expect(200);

    const saved = await api('put', `/study/workspaces/${workspaceId}`, cookie)
      .send({ revision: current.body.revision, notes: '', files })
      .expect(200);

    return saved.body.revision as number;
  }

  function analyze(cookie: string, workspaceId: string, revision: number) {
    return api('post', `/executions/workspaces/${workspaceId}`, cookie).send({
      requestKey: randomUUID(),
      kind: 'analysis',
      revision,
    });
  }

  function evaluation(
    attemptId: string,
    revision: number,
    stepId: string,
    statuses: Record<string, 'met' | 'not_met'>,
  ) {
    return {
      attemptId,
      revision,
      stepId,
      summary: 'Reviewed the saved files against every criterion.',
      criteria: Object.entries(statuses).map(([id, status]) => ({
        id,
        status,
        feedback: `${id} is ${status}.`,
      })),
      findings: [],
      hints: ['Re-read the criteria.', 'Check the HTTP boundary.'],
    };
  }

  // Simulates the worker: claim the lease and deliver one final event through the results contract.
  async function deliver(executionId: string, payload: unknown, tokens = 900) {
    const claim = await service.claim(executionId);
    const event = {
      version: 1,
      executionId,
      lease: claim.lease!,
      index: 100,
      status: 'completed',
      text: 'Analysis finished.',
      tokens,
      evaluation: payload,
    };

    await service.accept(event);

    return event;
  }

  async function workspace(cookie: string, workspaceId: string) {
    const response = await api(
      'get',
      `/study/workspaces/${workspaceId}`,
      cookie,
    ).expect(200);

    return response.body;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.AUTH_TEST_DATABASE_URL;
    process.env.WEB_ORIGIN = origin;
    process.env.AUTH_JWE_ACTIVE_KID = 'evaluation-test';
    process.env.AUTH_JWE_KEYS = JSON.stringify({
      'evaluation-test': 'ab'.repeat(32),
    });

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ExecutionService)
      .useFactory({
        inject: [PrismaService],
        factory: (database: PrismaService) =>
          new ExecutionService(
            new PrismaExecutionRepository(
              database,
              undefined,
              new PrismaAttemptProgression(),
              new PrismaRoadmapGeneration(),
            ),
            queue,
            new ParserSyntaxChecker(),
            noSources,
          ),
      })
      .compile();
    app = module.createNestApplication();
    configureHttp(app);
    await app.init();

    db = module.get(PrismaService);
    service = module.get(ExecutionService);
    vi.spyOn(module.get(ExecutionStreamService), 'broadcast').mockResolvedValue(
      undefined,
    );
  });

  beforeEach(() => {
    queue.publish.mockReset();
    queue.publish.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: { in: users } } });
    await app?.close();
  });

  it('rejects syntax errors before the queue without consuming inference quota', async () => {
    const alice = await student();
    const revision = await save(alice.cookie, alice.workspaceId, {
      'src/service.ts': 'export function greet(name: string {\n',
      Dockerfile: 'FROM node:24\nRUNN npm ci\n',
      'README.md': 'Notes are not syntax-checked.',
    });

    const response = await analyze(
      alice.cookie,
      alice.workspaceId,
      revision,
    ).expect(201);

    expect(response.body.status).toBe('syntax_error');
    expect(response.body.syntax).toMatchObject({
      status: 'failed',
      coverage: 'partial',
      unchecked: ['README.md'],
    });
    const failedPaths = response.body.syntax.diagnostics.map(
      (item: { path: string }) => item.path,
    );
    expect([...new Set(failedPaths)]).toEqual(['Dockerfile', 'src/service.ts']);
    expect(response.body.attempt.result.status).toBe('syntax_error');

    const quota = await api('get', '/executions/quota', alice.cookie).expect(
      200,
    );
    expect(quota.body).toMatchObject({ used: 0, reserved: 0 });
    expect(queue.publish).not.toHaveBeenCalled();
    expect(
      await db.execution.count({ where: { workspaceId: alice.workspaceId } }),
    ).toBe(0);
  });

  it('runs login → roadmap → edit → analysis → correction → approval → next step, unlocking once', async () => {
    const alice = await student();

    // A valid but conceptually wrong solution receives feedback and does not progress.
    const wrongRevision = await save(alice.cookie, alice.workspaceId, {
      'src/service.ts':
        'export const greet = (name: unknown) => `Hello ${String(name)}`;\n',
    });
    const wrong = await analyze(
      alice.cookie,
      alice.workspaceId,
      wrongRevision,
    ).expect(201);
    expect(wrong.body.status).toBe('queued');
    expect(queue.publish).toHaveBeenCalledWith(wrong.body.id);

    const claimed = await db.execution.findUniqueOrThrow({
      where: { id: wrong.body.id },
    });
    const input = claimed.input as {
      attemptId: string;
      syntax: { coverage: string };
    };
    expect(input.syntax.coverage).toBe('complete');

    await analyze(alice.cookie, alice.workspaceId, wrongRevision).expect(409);

    const rejected = evaluation(
      input.attemptId,
      wrongRevision,
      'validate-input',
      {
        'valid-name': 'not_met',
        'http-errors': 'not_met',
        greeting: 'met',
      },
    );
    await deliver(wrong.body.id, rejected);

    let current = await workspace(alice.cookie, alice.workspaceId);
    expect(current.currentStep).toBe(0);
    expect(current.attempts[0].result).toMatchObject({
      status: 'needs_work',
      evaluation: { hints: rejected.hints },
    });

    // The same revision cannot be re-rolled for a different verdict.
    await analyze(alice.cookie, alice.workspaceId, wrongRevision).expect(409);

    // After a correction, Core approves only when every criterion is met.
    const fixedRevision = await save(alice.cookie, alice.workspaceId, {
      'src/service.ts':
        'export function greet(name: unknown) {\n  if (typeof name !== "string" || !name.trim()) {\n    return { status: 400, body: { message: "Invalid name." } };\n  }\n\n  return { status: 200, body: { greeting: `Hello ${name}` } };\n}\n',
    });
    const fixed = await analyze(
      alice.cookie,
      alice.workspaceId,
      fixedRevision,
    ).expect(201);
    const fixedInput = (
      await db.execution.findUniqueOrThrow({ where: { id: fixed.body.id } })
    ).input as { attemptId: string };

    const approved = evaluation(
      fixedInput.attemptId,
      fixedRevision,
      'validate-input',
      met(FIRST_CRITERIA),
    );
    const event = await deliver(fixed.body.id, approved);

    current = await workspace(alice.cookie, alice.workspaceId);
    expect(current.currentStep).toBe(1);
    expect(current.attempts[0]).toMatchObject({
      revision: fixedRevision,
      result: { status: 'approved', executionId: fixed.body.id },
    });

    // Redelivered results are idempotent and never unlock a second step.
    await service.accept(event);
    await service.accept({ ...event, index: 99 });

    current = await workspace(alice.cookie, alice.workspaceId);
    expect(current.currentStep).toBe(1);

    const quota = await api('get', '/executions/quota', alice.cookie).expect(
      200,
    );
    expect(quota.body).toMatchObject({ used: 1800, reserved: 0 });

    // The second step can now be analyzed; completing it finishes the roadmap.
    const finalRevision = await save(alice.cookie, alice.workspaceId, {
      'src/greeting.ts':
        'export const greeting = (name: string) => `Hello ${name}`;\n',
      'src/http.ts':
        'import { greeting } from "./greeting";\n\nexport function handle(body: { name?: unknown }) {\n  if (typeof body.name !== "string" || !body.name) {\n    return { status: 400 };\n  }\n\n  return { status: 200, body: greeting(body.name) };\n}\n',
    });
    const last = await analyze(
      alice.cookie,
      alice.workspaceId,
      finalRevision,
    ).expect(201);
    const lastInput = (
      await db.execution.findUniqueOrThrow({ where: { id: last.body.id } })
    ).input as { attemptId: string; stepId: string };
    expect(lastInput.stepId).toBe('separate-rules');

    await deliver(
      last.body.id,
      evaluation(
        lastInput.attemptId,
        finalRevision,
        'separate-rules',
        met(SECOND_CRITERIA),
      ),
    );

    current = await workspace(alice.cookie, alice.workspaceId);
    expect(current.currentStep).toBe(2);

    await analyze(alice.cookie, alice.workspaceId, finalRevision).expect(409);
    await api(
      'post',
      `/study/workspaces/${alice.workspaceId}/attempts`,
      alice.cookie,
    )
      .send({ revision: finalRevision, stepId: 'separate-rules' })
      .expect(403);
  });

  it('rolls back usage, attempt outcome and progression together when the study adapter fails', async () => {
    const alice = await student();
    const revision = await save(alice.cookie, alice.workspaceId, {
      'main.ts': 'export const value = 1;',
    });
    const admitted = await analyze(
      alice.cookie,
      alice.workspaceId,
      revision,
    ).expect(201);
    const claim = await service.claim(admitted.body.id);
    const before = await db.execution.findUniqueOrThrow({
      where: { id: admitted.body.id },
    });
    const input = before.input as { attemptId: string };
    const quotaBefore = await db.executionQuota.findUniqueOrThrow({
      where: { id: before.quotaId },
    });
    const payload = evaluation(
      input.attemptId,
      revision,
      'validate-input',
      met(FIRST_CRITERIA),
    );
    const event = {
      version: 1 as const,
      executionId: before.id,
      lease: claim.lease!,
      index: 100,
      status: 'completed' as const,
      text: 'Analysis finished.',
      tokens: 900,
      evaluation: payload,
    };
    const progression = new PrismaAttemptProgression();
    const recordOutcome = progression.recordOutcome.bind(progression);
    vi.spyOn(progression, 'recordOutcome').mockImplementation(
      async (tx, execution, assess) => {
        await recordOutcome(tx, execution, assess);

        throw new Error('Study write interrupted');
      },
    );
    const failing = new PrismaExecutionRepository(
      db,
      undefined,
      progression,
      new PrismaRoadmapGeneration(),
    );

    await expect(failing.accept(event, null, [])).rejects.toThrow(
      'Study write interrupted',
    );

    const unchangedExecution = await db.execution.findUniqueOrThrow({
      where: { id: before.id },
    });
    const unchangedQuota = await db.executionQuota.findUniqueOrThrow({
      where: { id: before.quotaId },
    });
    const unchangedWorkspace = await workspace(alice.cookie, alice.workspaceId);

    expect(unchangedExecution).toEqual(before);
    expect(unchangedQuota).toEqual(quotaBefore);
    expect(unchangedWorkspace.currentStep).toBe(0);
    expect(unchangedWorkspace.attempts[0].result).toMatchObject({
      status: 'evaluating',
      executionId: before.id,
    });

    await service.accept(event);

    const completed = await workspace(alice.cookie, alice.workspaceId);

    expect(completed.currentStep).toBe(1);
    expect(completed.attempts[0].result.status).toBe('approved');
  });

  describe('untrusted results', () => {
    const allMet = met(FIRST_CRITERIA);
    let alice: Awaited<ReturnType<typeof student>>;

    async function analyzed(code: string) {
      const revision = await save(alice.cookie, alice.workspaceId, {
        'src/service.ts': code,
      });
      const created = await analyze(
        alice.cookie,
        alice.workspaceId,
        revision,
      ).expect(201);
      const input = (
        await db.execution.findUniqueOrThrow({
          where: { id: created.body.id },
        })
      ).input as { attemptId: string };

      return { id: created.body.id as string, revision, input };
    }

    async function resultOf(revision: number) {
      const current = await workspace(alice.cookie, alice.workspaceId);
      const attempt = current.attempts.find(
        (item: { revision: number }) => item.revision === revision,
      );

      return { step: current.currentStep, result: attempt.result };
    }

    it('never approves on invalid output, another attempt or a missing evaluation', async () => {
      alice = await student();

      const first = await analyzed('export const a = 1;\n');
      await deliver(first.id, {
        ...evaluation(
          first.input.attemptId,
          first.revision,
          'validate-input',
          allMet,
        ),
        approved: true,
      });
      expect(await resultOf(first.revision)).toEqual({
        step: 0,
        result: expect.objectContaining({
          status: 'analysis_failed',
          reason: 'invalid_output',
        }),
      });

      const second = await analyzed('export const b = 2;\n');
      await deliver(
        second.id,
        evaluation(
          first.input.attemptId,
          first.revision,
          'validate-input',
          allMet,
        ),
      );
      expect(await resultOf(second.revision)).toEqual({
        step: 0,
        result: expect.objectContaining({ reason: 'other_attempt' }),
      });

      const third = await analyzed('export const c = 3;\n');
      await deliver(
        third.id,
        evaluation(third.input.attemptId, third.revision, 'validate-input', {
          'valid-name': 'met',
          greeting: 'met',
        }),
      );
      expect(await resultOf(third.revision)).toEqual({
        step: 0,
        result: expect.objectContaining({ reason: 'criteria_mismatch' }),
      });

      const fourth = await analyzed('export const d = 4;\n');
      await deliver(fourth.id, undefined);
      expect(await resultOf(fourth.revision)).toEqual({
        step: 0,
        result: expect.objectContaining({ reason: 'no_evaluation' }),
      });
    });

    it('ignores a superseded lease and allows a retry after a failed analysis', async () => {
      alice = await student();

      // A result from a superseded lease is settled for billing but cannot approve.
      const fifth = await analyzed('export const e = 5;\n');
      const stale = await service.claim(fifth.id);
      await service.failed(fifth.id, stale.lease!);
      const retry = await service.claim(fifth.id);
      expect(retry.lease).not.toBe(stale.lease);

      await service.accept({
        version: 1,
        executionId: fifth.id,
        lease: stale.lease!,
        index: 100,
        status: 'completed',
        text: 'Old result',
        tokens: 100,
        evaluation: evaluation(
          fifth.input.attemptId,
          fifth.revision,
          'validate-input',
          allMet,
        ),
      });
      expect(await resultOf(fifth.revision)).toEqual({
        step: 0,
        result: expect.objectContaining({ status: 'evaluating' }),
      });

      // A failed analysis may be retried for the same revision and then approved.
      await service.accept({
        version: 1,
        executionId: fifth.id,
        lease: retry.lease!,
        index: 100,
        status: 'failed',
        text: 'Analysis failed.',
        tokens: 100,
      });
      expect(await resultOf(fifth.revision)).toEqual({
        step: 0,
        result: expect.objectContaining({
          status: 'analysis_failed',
          reason: 'failed',
        }),
      });

      const again = await analyze(
        alice.cookie,
        alice.workspaceId,
        fifth.revision,
      ).expect(201);
      await deliver(
        again.body.id,
        evaluation(
          fifth.input.attemptId,
          fifth.revision,
          'validate-input',
          allMet,
        ),
      );
      expect(await resultOf(fifth.revision)).toEqual({
        step: 1,
        result: expect.objectContaining({ status: 'approved' }),
      });
    });
  });
});
