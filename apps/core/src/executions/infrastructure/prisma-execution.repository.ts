import { randomUUID } from 'node:crypto';
import type { Execution, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { StudyError, roadmapSchema } from '../../study/domain/study.js';
import {
  ATTEMPT_BUDGET,
  DAILY_LIMIT,
  DEADLINE_MS,
  LEASE_MS,
  MAX_ATTEMPTS,
  RATE_LIMIT,
  RESERVATION,
  period,
  terminal,
} from '../domain/execution.js';
import type {
  ExecutionRequest,
  WorkerEvent,
  ExecutionRepository,
} from '../domain/execution.js';

type Transaction = Prisma.TransactionClient;

export class PrismaExecutionRepository implements ExecutionRepository {
  constructor(
    private readonly db: PrismaService,
    private readonly now = () => new Date(),
  ) {}

  async quota(userId: string) {
    const today = period(this.now());
    const quota = await this.db.executionQuota.findUnique({
      where: { userId_period: { userId, period: today } },
    });

    return {
      period: today,
      timezone: 'UTC',
      limit: DAILY_LIMIT,
      used: quota?.used ?? 0,
      reserved: quota?.reserved ?? 0,
      reservation: RESERVATION,
      resetsAt: new Date(`${today}T00:00:00Z`).getTime() + 86400000,
    };
  }

  async create(userId: string, workspaceId: string, input: ExecutionRequest) {
    const now = this.now();

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
          old.revision !== input.revision
        ) {
          throw new StudyError(
            409,
            'This request key already identifies a different request.',
          );
        }

        return previous;
      }

      const records = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM core.workspace WHERE id = ${workspaceId}::uuid
        AND user_id = ${userId}::uuid FOR UPDATE`;
      if (!records.length) {
        throw new StudyError(404, 'Workspace not found.');
      }
      const workspace = await tx.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        include: { roadmap: true, session: true },
      });
      if (workspace.revision !== input.revision) {
        throw new StudyError(
          409,
          'Save and reload the workspace before starting an execution.',
        );
      }

      const recent = await tx.execution.count({
        where: { userId, createdAt: { gte: new Date(now.getTime() - 60000) } },
      });
      if (recent >= RATE_LIMIT) {
        throw new StudyError(
          429,
          'Execution rate limit reached. Retry in one minute.',
        );
      }
      if (quota.used + quota.reserved + RESERVATION > DAILY_LIMIT) {
        throw new StudyError(
          429,
          'Daily token quota exhausted. It resets at 00:00 UTC.',
        );
      }

      const definition = roadmapSchema.parse(workspace.roadmap.definition);
      const step = definition.steps[workspace.currentStep];
      if (!step || !workspace.session) {
        throw new StudyError(409, 'No active study step.');
      }

      await tx.executionQuota.update({
        where: { id: quota.id },
        data: { reserved: { increment: RESERVATION } },
      });

      return tx.execution.create({
        data: {
          userId,
          workspaceId,
          quotaId: quota.id,
          requestKey: input.requestKey,
          createdAt: now,
          deadline: new Date(now.getTime() + DEADLINE_MS),
          input: {
            ...input,
            sessionId: workspace.session.id,
            stepId: step.id,
            files: workspace.files,
            challenge: step.challenge,
          },
        },
      });
    });

    return execution;
  }

  async owned(userId: string, id: string) {
    const job = await this.db.execution.findFirst({ where: { id, userId } });
    if (!job) {
      throw new StudyError(404, 'Execution not found.');
    }

    return job;
  }

  async list(userId: string, workspaceId: string) {
    const workspace = await this.db.workspace.findFirst({
      where: { id: workspaceId, userId },
    });
    if (!workspace) {
      throw new StudyError(404, 'Workspace not found.');
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
        throw new StudyError(404, 'Execution not found.');
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
  ) {
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
      if (job.attempts >= MAX_ATTEMPTS) {
        await this.finish(tx, job, 'failed');

        return { status: 'failed' };
      }

      const lease = randomUUID();
      await tx.executionQuota.update({
        where: { id: job.quotaId },
        data: {
          reserved: { decrement: ATTEMPT_BUDGET },
          used: { increment: ATTEMPT_BUDGET },
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
          reserved: { decrement: ATTEMPT_BUDGET },
          charged: { increment: ATTEMPT_BUDGET },
          text: '',
          eventIndex: 0,
          sequence: { increment: 1 },
        },
      });

      return {
        status: 'running',
        lease,
        input: job.input,
        budget: ATTEMPT_BUDGET,
      };
    });
  }

  async failed(id: string, lease: string) {
    return this.locked(id, async (tx, job) => {
      if (terminal(job.status) || job.lease !== lease) {
        return { status: job.status };
      }
      if (job.attempts >= MAX_ATTEMPTS) {
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

      // Each leased attempt settles once, even if its result arrives after retry or cancellation.
      if (
        event.status !== 'running' &&
        current.leases.includes(event.lease) &&
        !current.settledLeases.includes(event.lease)
      ) {
        const refund = ATTEMPT_BUDGET - event.tokens;
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
        return this.finish(tx, current, event.status, event.text);
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
