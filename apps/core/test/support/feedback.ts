import { randomUUID } from 'node:crypto';
import { FeedbackService } from '../../src/feedback/application/feedback.service.js';
import type { FeedbackSignal } from '../../src/feedback/domain/feedback.js';
import { ExecutionServiceAnswers } from '../../src/feedback/infrastructure/execution-answers.js';
import { PrismaFeedbackRepository } from '../../src/feedback/infrastructure/prisma-feedback-repository.js';
import { PrismaRoadmapDrafts } from '../../src/study/infrastructure/prisma-roadmap-drafts.js';
import { PrismaStudyRepository } from '../../src/study/infrastructure/prisma-study-repository.js';
import { memoryHarness, type MemoryStudent } from './memory.js';

export function feedbackHarness() {
  const memory = memoryHarness();
  const { context } = memory;
  const users: string[] = [];
  const signals: FeedbackSignal[] = [];
  let failing = false;
  let repository: PrismaFeedbackRepository;
  let service: FeedbackService;
  const sink = {
    async send(signal: FeedbackSignal) {
      if (failing) {
        throw new Error('Feedback sink unavailable.');
      }

      signals.push(signal);
    },
  };

  beforeEach(() => {
    signals.length = 0;
    failing = false;
    repository = new PrismaFeedbackRepository(context.db);
    service = new FeedbackService(
      repository,
      new ExecutionServiceAnswers(memory.services().service),
      sink,
      () => context.now,
    );
  });

  afterEach(async () => {
    await context.db.user.deleteMany({ where: { id: { in: users } } });

    users.length = 0;
  });

  async function student() {
    const user = await context.db.user.create({
      data: {
        email: `feedback-${randomUUID()}@example.com`,
        passwordHash: 'test-only',
      },
    });
    users.push(user.id);

    const studies = new PrismaStudyRepository(context.db);
    const fixture = await studies.fixture();
    const workspace = await studies.start(user.id, fixture.id);
    if (!workspace) {
      throw new Error('Feedback fixture workspace was not created.');
    }

    return { userId: user.id, workspaceId: workspace.id };
  }

  async function completed(student: MemoryStudent) {
    const execution = await memory.admit(student);

    await memory.complete(execution.id);

    return execution;
  }

  async function analysis(student: MemoryStudent) {
    const built = memory.services();
    const analysisPayload = {
      requestKey: randomUUID(),
      kind: 'analysis',
      revision: 0,
    };
    const execution = await built.service.submit(
      student.userId,
      student.workspaceId,
      analysisPayload,
    );
    if (!('id' in execution)) {
      throw new Error('Analysis fixture failed syntax validation.');
    }

    const studies = new PrismaStudyRepository(context.db);
    const workspace = await studies.workspace(
      student.userId,
      student.workspaceId,
    );
    if (!workspace) {
      throw new Error('Analysis fixture workspace was not found.');
    }

    const attempt = workspace.attempts[0];
    const evaluation = {
      attemptId: attempt.id,
      revision: attempt.revision,
      stepId: attempt.stepId,
      summary: 'The saved files need further work.',
      criteria: attempt.challenge.criteria.map((criterion) => ({
        id: criterion.id,
        status: 'not_met',
        feedback: 'Implement this criterion.',
      })),
      findings: [],
      hints: ['Read the challenge criteria.'],
    };
    const claim = await built.worker.claim(execution.id);
    const event = {
      ...context.event(execution.id, claim.lease!),
      evaluation,
    };

    await built.worker.accept(event);

    return execution;
  }

  async function recommendation(student: MemoryStudent) {
    const drafts = new PrismaRoadmapDrafts(context.db);
    const draft = await drafts.create(student.userId, {
      goal: 'Build a reservation API',
      level: 'intermediate',
    });
    const built = memory.services();
    const recommendationPayload = {
      requestKey: randomUUID(),
      kind: 'recommendation',
    };
    const execution = await built.service.recommend(
      student.userId,
      draft.workspaceId,
      recommendationPayload,
    );
    const claim = await built.worker.claim(execution.id);
    const event = {
      ...context.event(execution.id, claim.lease!),
      recommendation: { matches: [] },
    };

    await built.worker.accept(event);

    return execution;
  }

  function stored(executionId: string) {
    return context.db.answerFeedback.findUnique({ where: { executionId } });
  }

  function advance(milliseconds: number) {
    context.now = new Date(context.now.getTime() + milliseconds);
  }

  return {
    context,
    memory,
    student,
    completed,
    analysis,
    recommendation,
    stored,
    advance,
    signals,
    get repository() {
      return repository;
    },
    get service() {
      return service;
    },
    set failing(value: boolean) {
      failing = value;
    },
  };
}
