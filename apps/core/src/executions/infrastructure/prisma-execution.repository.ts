import { randomUUID } from 'node:crypto';
import type { Execution, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { SyntaxReport } from '../../analysis/domain/syntax.js';
import { roadmapSchema, stepSchema } from '../../study/domain/study.js';
import type { Step } from '../../study/domain/study.js';
import {
  assessEvaluation,
  ExecutionError,
  ATTEMPT_BUDGET,
  DAILY_LIMIT,
  DEADLINE_MS,
  LEASE_MS,
  MAX_ATTEMPTS,
  RATE_LIMIT,
  period,
  resetsAt,
  terminal,
  TUTOR_ATTEMPT_BUDGET,
  usesModel,
} from '../domain/execution.js';
import type {
  ExecutionRequest,
  WorkerEvent,
  ExecutionRepository,
} from '../domain/execution.js';
import { assertMentionsReady, recentTurns } from '../domain/tutor-context.js';
import type { TutorSource } from '../domain/tutor-context.js';

type Transaction = Prisma.TransactionClient;

function attemptBudget(input: Prisma.JsonValue) {
  return usesModel(input) ? TUTOR_ATTEMPT_BUDGET : ATTEMPT_BUDGET;
}

// A job may hold fewer than MAX_ATTEMPTS when the quota only had room for some.
function retriesExhausted(job: Execution) {
  return (
    job.attempts >= MAX_ATTEMPTS || job.reserved < attemptBudget(job.input)
  );
}

type AttemptState = { status?: string; executionId?: string };

async function lockWorkspace(tx: Transaction, id: string, userId?: string) {
  const records = userId
    ? await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM core.workspace WHERE id = ${id}::uuid
        AND user_id = ${userId}::uuid FOR UPDATE`
    : await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM core.workspace WHERE id = ${id}::uuid FOR UPDATE`;

  return records.length > 0;
}

// The caller holds the workspace lock, which serializes every attempt result change.
function snapshotAttempt(
  tx: Transaction,
  workspaceId: string,
  revision: number,
  step: Step,
  files: Prisma.JsonValue,
) {
  return tx.studyAttempt.upsert({
    where: {
      workspaceId_revision_stepId: { workspaceId, revision, stepId: step.id },
    },
    create: {
      workspaceId,
      stepId: step.id,
      revision,
      files: files as Prisma.InputJsonValue,
      challenge: step.challenge,
    },
    update: {},
  });
}

export class PrismaExecutionRepository implements ExecutionRepository {
  constructor(
    private readonly db: PrismaService,
    private readonly now = () => new Date(),
  ) {}

  async quota(userId: string) {
    const now = this.now();
    const today = period(now);
    const quota = await this.db.executionQuota.findUnique({
      where: { userId_period: { userId, period: today } },
    });

    return {
      period: today,
      timezone: 'UTC',
      limit: DAILY_LIMIT,
      used: quota?.used ?? 0,
      reserved: quota?.reserved ?? 0,
      reservation: TUTOR_ATTEMPT_BUDGET,
      resetsAt: resetsAt(now),
    };
  }

  async create(
    userId: string,
    workspaceId: string,
    input: ExecutionRequest,
    context: { syntax?: SyntaxReport; sources: TutorSource[] },
  ) {
    const { syntax, sources } = context;
    const now = this.now();
    const tracked = !!input.mode || input.kind === 'analysis';
    const budget = tracked ? TUTOR_ATTEMPT_BUDGET : ATTEMPT_BUDGET;

    const execution = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM core.app_user WHERE id = ${userId}::uuid FOR UPDATE`;

      // One quota-row lock serializes reservations across all of a user's workspaces.
      await tx.$executeRaw`
        INSERT INTO core.execution_quota (user_id, period) VALUES (${userId}::uuid, ${period(now)})
        ON CONFLICT (user_id, period) DO NOTHING`;
      const quotas = await tx.$queryRaw<
        { id: string; used: number; reserved: number }[]
      >`
        SELECT id, used, reserved FROM core.execution_quota
        WHERE user_id = ${userId}::uuid AND period = ${period(now)} FOR UPDATE`;
      const quota = quotas[0];

      const previous = await tx.execution.findUnique({
        where: { userId_requestKey: { userId, requestKey: input.requestKey } },
      });
      if (previous) {
        const old = previous.input as Record<string, unknown>;
        if (
          previous.workspaceId !== workspaceId ||
          old.kind !== input.kind ||
          old.prompt !== input.prompt ||
          old.revision !== input.revision ||
          old.mode !== input.mode ||
          old.effort !== input.effort ||
          old.activeFile !== input.activeFile ||
          JSON.stringify(old.selection) !== JSON.stringify(input.selection) ||
          JSON.stringify(old.sourceIds) !== JSON.stringify(input.sourceIds)
        ) {
          throw new ExecutionError(
            'conflict',
            'This request key already identifies a different request.',
          );
        }

        return previous;
      }

      if (!(await lockWorkspace(tx, workspaceId, userId))) {
        throw new ExecutionError('not_found', 'Workspace not found.');
      }
      const workspace = await tx.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        include: {
          roadmap: true,
          session: true,
        },
      });
      if (workspace.revision !== input.revision) {
        throw new ExecutionError(
          'conflict',
          'Save and reload the workspace before starting an execution.',
        );
      }

      const definition = roadmapSchema.parse(workspace.roadmap.definition);
      const step = definition.steps[workspace.currentStep];
      if (!step || !workspace.session) {
        throw new ExecutionError('conflict', 'No active study step.');
      }

      const files = workspace.files as Record<string, string>;
      if (
        input.activeFile &&
        (!Object.hasOwn(files, input.activeFile) ||
          input.activeFile.endsWith('/'))
      ) {
        throw new ExecutionError(
          'invalid',
          'Select a file in the saved workspace.',
        );
      }
      if (input.selection) {
        const content = input.activeFile ? files[input.activeFile] : undefined;
        if (
          content === undefined ||
          input.selection.start > input.selection.end ||
          input.selection.end > content.length
        ) {
          throw new ExecutionError(
            'invalid',
            'Selection is outside the saved file.',
          );
        }
      }

      const recentResults = input.mode
        ? await tx.studyAttempt.findMany({
            where: { workspaceId, stepId: step.id },
            select: { revision: true, result: true },
            orderBy: { createdAt: 'desc' },
            take: 3,
          })
        : [];
      const solutionAllowed = recentResults.length >= 3;

      // Short-term conversation memory: the last completed exchanges of this chat.
      const completed = input.mode
        ? await tx.execution.findMany({
            where: { workspaceId, userId, status: 'completed' },
            select: { input: true, text: true },
            orderBy: { createdAt: 'desc' },
            take: 10,
          })
        : [];
      const turns = recentTurns(completed);

      assertMentionsReady(input.sourceIds, sources);

      if (input.mode === 'solution' && !solutionAllowed) {
        throw new ExecutionError(
          'forbidden',
          'Solution guidance requires three saved attempts on different revisions of this step.',
        );
      }

      let attemptId: string | undefined;
      if (input.kind === 'analysis') {
        // The service linted this revision's files; the workspace lock keeps them unchanged.
        if (!syntax) {
          throw new ExecutionError(
            'conflict',
            'Save and reload the workspace before starting an execution.',
          );
        }

        const attempt = await snapshotAttempt(
          tx,
          workspaceId,
          input.revision,
          step,
          workspace.files,
        );
        const state = attempt.result as AttemptState;
        if (state.status === 'approved' || state.status === 'needs_work') {
          throw new ExecutionError(
            'conflict',
            'This revision was already analyzed. Save a change before analyzing again.',
          );
        }

        if (state.status === 'evaluating' && state.executionId) {
          const running = await tx.execution.findUnique({
            where: { id: state.executionId },
          });
          if (running && !terminal(running.status)) {
            throw new ExecutionError(
              'conflict',
              'An analysis of this revision is already running.',
            );
          }
        }

        attemptId = attempt.id;
      }

      const recent = await tx.execution.count({
        where: { userId, createdAt: { gte: new Date(now.getTime() - 60000) } },
      });
      if (recent >= RATE_LIMIT) {
        throw new ExecutionError(
          'rate_limited',
          'Execution rate limit reached. Retry in one minute.',
        );
      }

      // Reserve as many attempts as the remaining quota allows; one is enough to start.
      const remaining = DAILY_LIMIT - quota.used - quota.reserved;
      const attempts = Math.min(MAX_ATTEMPTS, Math.floor(remaining / budget));
      if (attempts < 1) {
        const left = Math.max(0, remaining);
        const reset = period(new Date(resetsAt(now)));

        throw new ExecutionError(
          'rate_limited',
          `Not enough daily token quota for this request (${left} left, ${budget} needed). It resets on ${reset} at 00:00 UTC.`,
        );
      }

      const reservation = budget * attempts;

      await tx.executionQuota.update({
        where: { id: quota.id },
        data: { reserved: { increment: reservation } },
      });

      const created = await tx.execution.create({
        data: {
          userId,
          workspaceId,
          quotaId: quota.id,
          requestKey: input.requestKey,
          createdAt: now,
          deadline: new Date(now.getTime() + DEADLINE_MS),
          reserved: reservation,
          input: {
            ...input,
            sessionId: workspace.session.id,
            stepId: step.id,
            files: workspace.files,
            challenge: step.challenge,
            ...(input.mode
              ? {
                  objective: definition.description,
                  stepTitle: step.title,
                  solutionAllowed,
                  recentResults,
                  workspaceId,
                  sources,
                  recentTurns: turns,
                }
              : {}),
            ...(attemptId && syntax
              ? {
                  attemptId,
                  objective: definition.description,
                  stepTitle: step.title,
                  syntax: {
                    coverage: syntax.coverage,
                    checked: syntax.checked,
                    unchecked: syntax.unchecked,
                  },
                }
              : {}),
          },
        },
      });

      if (attemptId) {
        await tx.studyAttempt.update({
          where: { id: attemptId },
          data: { result: { status: 'evaluating', executionId: created.id } },
        });
      }

      return created;
    });

    return execution;
  }

  async analysisFiles(userId: string, workspaceId: string, revision: number) {
    const workspace = await this.db.workspace.findFirst({
      where: { id: workspaceId, userId },
    });
    if (!workspace) {
      throw new ExecutionError('not_found', 'Workspace not found.');
    }

    if (workspace.revision !== revision) {
      return null;
    }

    return workspace.files as Record<string, string>;
  }

  async rejectSyntax(
    userId: string,
    workspaceId: string,
    revision: number,
    syntax: SyntaxReport,
  ) {
    return this.db.$transaction(async (tx) => {
      if (!(await lockWorkspace(tx, workspaceId, userId))) {
        throw new ExecutionError('not_found', 'Workspace not found.');
      }

      const workspace = await tx.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        include: { roadmap: true },
      });
      if (workspace.revision !== revision) {
        throw new ExecutionError(
          'conflict',
          'Save and reload the workspace before starting an execution.',
        );
      }

      const definition = roadmapSchema.parse(workspace.roadmap.definition);
      const step = definition.steps[workspace.currentStep];
      if (!step) {
        throw new ExecutionError('conflict', 'No active study step.');
      }

      const attempt = await snapshotAttempt(
        tx,
        workspaceId,
        revision,
        step,
        workspace.files,
      );
      const state = attempt.result as AttemptState;
      if (state.status !== 'not_evaluated') {
        return attempt;
      }

      return tx.studyAttempt.update({
        where: { id: attempt.id },
        data: { result: { status: 'syntax_error', syntax } },
      });
    });
  }

  async owned(userId: string, id: string) {
    const job = await this.db.execution.findFirst({ where: { id, userId } });
    if (!job) {
      throw new ExecutionError('not_found', 'Execution not found.');
    }

    return job;
  }

  async list(userId: string, workspaceId: string) {
    const workspace = await this.db.workspace.findFirst({
      where: { id: workspaceId, userId },
    });
    if (!workspace) {
      throw new ExecutionError('not_found', 'Workspace not found.');
    }

    const jobs = await this.db.execution.findMany({
      where: { userId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return jobs;
  }

  private async locked<T>(
    id: string,
    action: (tx: Transaction, job: Execution) => Promise<T>,
  ) {
    return this.db.$transaction(async (tx) => {
      const records = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM core.execution WHERE id = ${id}::uuid FOR UPDATE`;
      if (!records.length) {
        throw new ExecutionError('not_found', 'Execution not found.');
      }

      const job = await tx.execution.findUniqueOrThrow({ where: { id } });

      return action(tx, job);
    });
  }

  // Records an analysis outcome in the same transaction that finishes its execution.
  private async recordOutcome(
    tx: Transaction,
    job: Execution,
    status: string,
    evaluation: unknown,
  ) {
    const input = job.input as { attemptId?: string };
    if (!input.attemptId) {
      return;
    }

    // Lock order matches creation and saves: workspace before attempt.
    await lockWorkspace(tx, job.workspaceId);

    const attempt = await tx.studyAttempt.findUnique({
      where: { id: input.attemptId },
      include: { workspace: { include: { roadmap: true } } },
    });
    const state = attempt?.result as AttemptState | undefined;
    if (
      !attempt ||
      attempt.workspaceId !== job.workspaceId ||
      state?.status !== 'evaluating' ||
      state.executionId !== job.id
    ) {
      return;
    }

    const challenge = stepSchema.shape.challenge.parse(attempt.challenge);
    const snapshot = {
      id: attempt.id,
      revision: attempt.revision,
      stepId: attempt.stepId,
      criteria: challenge.criteria.map((criterion) => criterion.id),
    };
    const finishedAt = this.now().toISOString();

    let assessment: ReturnType<typeof assessEvaluation> = {
      valid: false,
      reason: status === 'completed' ? 'no_evaluation' : status,
    };
    if (status === 'completed' && evaluation !== undefined) {
      assessment = assessEvaluation(evaluation, snapshot);
    }

    if (!assessment.valid) {
      await tx.studyAttempt.update({
        where: { id: attempt.id },
        data: {
          result: {
            status: 'analysis_failed',
            executionId: job.id,
            reason: assessment.reason,
            finishedAt,
          },
        },
      });

      return;
    }

    await tx.studyAttempt.update({
      where: { id: attempt.id },
      data: {
        result: {
          status: assessment.approved ? 'approved' : 'needs_work',
          executionId: job.id,
          evaluatedAt: finishedAt,
          evaluation: assessment.evaluation,
        },
      },
    });

    if (!assessment.approved) {
      return;
    }

    const steps = roadmapSchema.parse(
      attempt.workspace.roadmap.definition,
    ).steps;
    const index = steps.findIndex((step) => step.id === attempt.stepId);

    // Conditional increment: redelivered or concurrent approvals unlock the next step once.
    await tx.workspace.updateMany({
      where: { id: job.workspaceId, currentStep: index },
      data: { currentStep: { increment: 1 } },
    });
  }

  private async finish(
    tx: Transaction,
    job: Execution,
    status: string,
    text = job.text,
    evaluation?: unknown,
  ) {
    await this.recordOutcome(tx, job, status, evaluation);

    await tx.executionQuota.update({
      where: { id: job.quotaId },
      data: {
        reserved: { decrement: job.reserved },
      },
    });

    return tx.execution.update({
      where: { id: job.id },
      data: {
        status,
        text,
        reserved: 0,
        finishedAt: this.now(),
        sequence: { increment: 1 },
      },
    });
  }

  async cancel(userId: string, id: string) {
    await this.owned(userId, id);

    const job = await this.locked(id, async (tx, current) => {
      if (terminal(current.status)) {
        return current;
      }

      // An interrupted attempt keeps its bounded charge until usage is known.
      return this.finish(tx, current, 'cancelled');
    });

    return job;
  }

  async claim(id: string) {
    return this.locked(id, async (tx, job) => {
      const now = this.now();
      if (terminal(job.status)) {
        return { status: job.status };
      }
      if (job.deadline <= now) {
        await this.finish(tx, job, 'timed_out');

        return { status: 'timed_out' };
      }
      if (job.leaseUntil && job.leaseUntil > now) {
        return { status: 'busy' };
      }
      if (retriesExhausted(job)) {
        await this.finish(tx, job, 'failed');

        return { status: 'failed' };
      }

      const lease = randomUUID();
      const budget = attemptBudget(job.input);
      await tx.executionQuota.update({
        where: { id: job.quotaId },
        data: {
          reserved: { decrement: budget },
          used: { increment: budget },
        },
      });
      await tx.execution.update({
        where: { id },
        data: {
          status: 'running',
          lease,
          leases: { push: lease },
          leaseUntil: new Date(now.getTime() + LEASE_MS),
          attempts: { increment: 1 },
          reserved: { decrement: budget },
          charged: { increment: budget },
          text: '',
          eventIndex: 0,
          sequence: { increment: 1 },
        },
      });

      return {
        status: 'running',
        lease,
        input: job.input,
        budget,
      };
    });
  }

  async failed(id: string, lease: string) {
    return this.locked(id, async (tx, job) => {
      if (terminal(job.status) || job.lease !== lease) {
        return { status: job.status };
      }
      if (retriesExhausted(job)) {
        await this.finish(tx, job, 'failed');

        return { status: 'failed' };
      }

      await tx.execution.update({
        where: { id },
        data: { leaseUntil: this.now() },
      });

      return { status: 'retry' };
    });
  }

  async active(id: string, lease: string) {
    const job = await this.db.execution.findUnique({ where: { id } });

    return (
      !!job &&
      job.status === 'running' &&
      job.lease === lease &&
      !!job.leaseUntil &&
      job.leaseUntil > this.now() &&
      job.deadline > this.now()
    );
  }

  async accept(event: WorkerEvent) {
    const job = await this.locked(event.executionId, async (tx, record) => {
      let current = record;
      const budget = attemptBudget(current.input);
      if (event.tokens > budget) {
        throw new ExecutionError(
          'invalid',
          'Usage exceeds the authorized attempt budget.',
        );
      }

      // Each leased attempt settles once, even if its result arrives after retry or cancellation.
      if (
        event.status !== 'running' &&
        current.leases.includes(event.lease) &&
        !current.settledLeases.includes(event.lease)
      ) {
        const refund = budget - event.tokens;
        await tx.executionQuota.update({
          where: { id: current.quotaId },
          data: { used: { decrement: refund } },
        });

        current = await tx.execution.update({
          where: { id: current.id },
          data: {
            settledLeases: { push: event.lease },
            charged: { decrement: refund },
            sequence: { increment: 1 },
          },
        });
      }

      if (
        current.lease !== event.lease ||
        current.eventIndex >= event.index ||
        terminal(current.status)
      ) {
        return current;
      }
      if (current.deadline <= this.now()) {
        return this.finish(tx, current, 'timed_out');
      }

      await tx.execution.update({
        where: { id: current.id },
        data: {
          eventIndex: event.index,
          firstEventAt: current.firstEventAt ?? this.now(),
        },
      });
      if (event.status !== 'running') {
        return this.finish(
          tx,
          current,
          event.status,
          event.text,
          event.evaluation,
        );
      }

      return tx.execution.update({
        where: { id: current.id },
        data: { text: event.text, sequence: { increment: 1 } },
      });
    });

    return job;
  }

  async markPublished(id: string) {
    await this.db.execution.updateMany({
      where: { id, publishedAt: null },
      data: { publishedAt: this.now() },
    });
  }

  async pending() {
    return this.db.execution.findMany({
      where: {
        status: 'queued',
        publishedAt: null,
        deadline: { gt: this.now() },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  async expire() {
    const overdue = await this.db.execution.findMany({
      where: {
        status: { in: ['queued', 'running'] },
        deadline: { lte: this.now() },
      },
      take: 100,
    });

    for (const job of overdue) {
      await this.locked(job.id, async (tx, current) => {
        if (!terminal(current.status)) {
          await this.finish(tx, current, 'timed_out');
        }
      });
    }

    await this.db.streamTicket.deleteMany({
      where: { expiresAt: { lte: this.now() } },
    });

    return overdue.length;
  }
}
