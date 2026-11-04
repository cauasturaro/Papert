import { randomUUID } from 'node:crypto';
import type { Execution, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { SyntaxReport } from '../../analysis/domain/syntax.js';
import type { ExecutionStudyProgression } from '../domain/attempt-progression.js';
import {
  ExecutionError,
  DAILY_LIMIT,
  LEASE_MS,
  period,
  resetsAt,
  terminal,
  TUTOR_ATTEMPT_BUDGET,
} from '../domain/execution.js';
import type {
  ExecutionRequest,
  WorkerEvent,
  ExecutionRepository,
} from '../domain/execution.js';
import type { TutorSource } from '../domain/tutor-context.js';
import {
  attemptBudget,
  activeStudyStep,
  activeLease,
  claimDecision,
  failureDecision,
  usageRefund,
  acceptsEvent,
  analysisOutcome,
} from '../domain/policy.js';
import { admitExecution } from './prisma-execution-admission.js';
import { lockWorkspace } from './execution-locks.js';
import type { AttemptState } from '../domain/policy.js';

type Transaction = Prisma.TransactionClient;

export class PrismaExecutionRepository implements ExecutionRepository {
  constructor(
    private readonly db: PrismaService,
    private readonly now = () => new Date(),
    private readonly study: ExecutionStudyProgression,
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

  create(
    userId: string,
    workspaceId: string,
    input: ExecutionRequest,
    context: { syntax?: SyntaxReport; sources: TutorSource[] },
  ) {
    return admitExecution(
      this.db,
      this.study,
      this.now,
      userId,
      workspaceId,
      input,
      context,
    );
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

      const definition = this.study.definition(workspace.roadmap.definition);
      const step = activeStudyStep(definition.steps[workspace.currentStep]);

      const attempt = await this.study.snapshot(
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

      return this.study.updateResult(tx, attempt.id, {
        status: 'syntax_error',
        syntax,
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

  private async finish(
    tx: Transaction,
    job: Execution,
    status: string,
    text = job.text,
    evaluation?: unknown,
  ) {
    await this.study.recordOutcome(tx, job, (snapshot) =>
      analysisOutcome(snapshot, job.id, status, evaluation, this.now()),
    );

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
      const decision = claimDecision(job, now);
      if (decision.action === 'finish') {
        await this.finish(tx, job, decision.status);
      }
      if (decision.action !== 'claim') {
        return { status: decision.status };
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
      const decision = failureDecision(job, lease);
      if (decision.action === 'finish') {
        await this.finish(tx, job, decision.status);
      }
      if (decision.action !== 'release') {
        return { status: decision.status };
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

    return !!job && activeLease(job, lease, this.now(), this.now());
  }

  async accept(event: WorkerEvent) {
    const job = await this.locked(event.executionId, async (tx, record) => {
      let current = record;
      const refund = usageRefund(current, event);
      if (refund !== null) {
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

      if (!acceptsEvent(current, event)) {
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
