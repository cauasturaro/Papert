import { createTestApp } from './app.js';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ParserSyntaxChecker } from '../../src/analysis/infrastructure/parser-syntax-checker.js';
import { ExecutionStreamService } from '../../src/executions/application/execution-stream.service.js';
import type { ExecutionWorkerService } from '../../src/executions/application/execution-worker.service.js';
import { ExecutionService } from '../../src/executions/application/execution.service.js';
import { PrismaService } from '../../src/common/infrastructure/database/prisma.service.js';
import { EngagementService } from '../../src/engagement/application/engagement.service.js';
import { PrismaEngagementRepository } from '../../src/engagement/infrastructure/prisma-engagement-repository.js';
import { StudyServiceRoadmaps } from '../../src/engagement/infrastructure/study-roadmaps.js';
import { StudyService } from '../../src/study/application/study.service.js';
import { createExecutions } from './executions.js';

// These suites do not exercise the community catalog.
const noCatalog = { candidates: async () => [], publishedIds: async () => [] };

// These suites do not exercise workspace sources.
const noSources = { ready: async () => [] };

export const FIRST_CRITERIA = ['valid-name', 'http-errors', 'greeting'];

export function met(ids: string[]) {
  return Object.fromEntries(ids.map((id) => [id, 'met' as const]));
}

export function engagementHarness() {
  let instant = new Date('2026-11-06T12:00:00Z');
  const now = () => instant;
  let app: INestApplication;
  let db: PrismaService;
  let worker: ExecutionWorkerService;
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

    return {
      cookie,
      userId: registered.body.user.id as string,
      workspaceId: started.body.id as string,
    };
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
    const claim = await worker.claim(executionId);
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

    await worker.accept(event);

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

    const { app: started, module } = await createTestApp((builder) =>
      builder
        .overrideProvider(ExecutionService)
        .useFactory({
          inject: [PrismaService],
          factory: (database: PrismaService) => {
            const built = createExecutions(
              database,
              queue,
              new ParserSyntaxChecker(),
              noSources,
              noCatalog,
              now,
            );

            worker = built.worker;

            return built.service;
          },
        })
        .overrideProvider(EngagementService)
        .useFactory({
          inject: [PrismaService, StudyService],
          factory: (database: PrismaService, study: StudyService) =>
            new EngagementService(
              new PrismaEngagementRepository(database),
              new StudyServiceRoadmaps(study),
              now,
            ),
        }),
    );

    app = started;

    db = module.get(PrismaService);
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

  async function attempt(
    learner: { cookie: string; workspaceId: string },
    approved = false,
    tamper?: (payload: ReturnType<typeof evaluation>) => unknown,
  ) {
    const current = await workspace(learner.cookie, learner.workspaceId);
    const step = current.roadmap.definition.steps[current.currentStep];

    const files = {
      'src/answer.ts': 'export const answer = 1; // ' + randomUUID(),
    };
    const revision = await save(learner.cookie, learner.workspaceId, files);

    const admitted = await analyze(
      learner.cookie,
      learner.workspaceId,
      revision,
    ).expect(201);

    const row = await db.execution.findUniqueOrThrow({
      where: { id: admitted.body.id },
    });

    const input = row.input as { attemptId: string };
    const statuses = Object.fromEntries(
      step.challenge.criteria.map((criterion: { id: string }) => [
        criterion.id,
        approved ? ('met' as const) : ('not_met' as const),
      ]),
    );
    const payload = evaluation(input.attemptId, revision, step.id, statuses);

    return deliver(row.id, tamper ? tamper(payload) : payload, 1);
  }

  return {
    at(value: string) {
      instant = new Date(value);
    },
    attempt,
    api,
    student,
    save,
    analyze,
    evaluation,
    deliver,
    workspace,
    get db() {
      return db;
    },
    get worker() {
      return worker;
    },
    queue,
  };
}
