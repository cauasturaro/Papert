import { executionRecord } from './execution-snapshot.js';
import { randomUUID } from 'node:crypto';
import type { Execution, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import { ExecutionError, terminal } from '../domain/execution.js';
import type { WorkerEvent } from '../domain/execution.js';
import { admittedSourceIds } from '../domain/tutor/grounding.js';
import type { Grounding } from '../domain/tutor/grounding.js';
import {
  acceptsEvent,
  activeLease,
  claimDecision,
  failureDecision,
  LEASE_MS,
} from '../domain/admission/lease.js';
import { attemptBudget, usageRefund } from '../domain/admission/quota.js';
import { offeredRoadmapIds } from '../domain/roadmaps/recommendation.js';
import type {
  DraftScope,
  ExecutionLifecycle,
} from '../domain/ports/execution-lifecycle.js';
import { PrismaExecutionSettlement } from './prisma-execution-settlement.js';
import type { ExecutionRecommendationDrafts } from '../domain/ports/execution-recommendation-drafts.js';
import type { ExecutionRoadmapDrafts } from '../domain/ports/execution-roadmap-drafts.js';
import type { ExecutionStudyProgression } from '../domain/ports/execution-study-progression.js';
import type { ExecutionMemory } from '../domain/ports/execution-memory.js';
import type { ExecutionEngagement } from '../domain/ports/execution-engagement.js';

type Transaction = Prisma.TransactionClient;

/** Every transition locks the execution row first, then settles through PrismaExecutionSettlement. */
export class PrismaExecutionLifecycle implements ExecutionLifecycle {
  private readonly settlement: PrismaExecutionSettlement;

  constructor(
    private readonly db: PrismaService,
    private readonly now = () => new Date(),
    study: ExecutionStudyProgression,
    drafts: ExecutionRoadmapDrafts,
    recommendations: ExecutionRecommendationDrafts,
    memory: ExecutionMemory,
    engagement: ExecutionEngagement,
  ) {
    this.settlement = new PrismaExecutionSettlement(
      now,
      study,
      drafts,
      recommendations,
      memory,
      engagement,
    );
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

  async cancel(userId: string, id: string) {
    const owned = await this.db.execution.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!owned) {
      throw new ExecutionError('not_found', 'Execution not found.');
    }

    const job = await this.locked(id, async (tx, current) => {
      if (terminal(current.status)) {
        return current;
      }

      // An interrupted attempt keeps its bounded charge until usage is known.
      return this.settlement.finish(tx, current, 'cancelled');
    });

    return executionRecord(job);
  }

  async claim(id: string, claimId?: string) {
    return this.locked(id, async (tx, job) => {
      const now = this.now();
      if (
        claimId &&
        job.claimId === claimId &&
        job.lease &&
        activeLease(job, job.lease, now, now)
      ) {
        return {
          status: 'running',
          lease: job.lease,
          input: job.input,
          budget: attemptBudget(job.input),
        };
      }

      const decision = claimDecision(job, now);
      if (decision.action === 'finish') {
        await this.settlement.finish(tx, job, decision.status);
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
          claimId: claimId ?? null,
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
        await this.settlement.finish(tx, job, decision.status);
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

  async sourceScope(id: string) {
    const job = await this.db.execution.findUnique({ where: { id } });

    if (!job) {
      return null;
    }

    return {
      userId: job.userId,
      workspaceId: job.workspaceId,
      sourceIds: admittedSourceIds(job.input),
      offeredRoadmapIds: offeredRoadmapIds(job.input),
    };
  }

  async accept(
    event: WorkerEvent,
    grounding: Grounding | null,
    scope: DraftScope,
  ) {
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
        return this.settlement.finish(tx, current, 'timed_out');
      }

      await tx.execution.update({
        where: { id: current.id },
        data: {
          eventIndex: event.index,
          firstEventAt: current.firstEventAt ?? this.now(),
        },
      });
      if (event.status !== 'running') {
        return this.settlement.finish(tx, current, event.status, {
          text: event.text,
          evaluation: event.evaluation,
          grounding,
          roadmap: event.roadmap,
          recommendation: event.recommendation,
          memory: event.memory,
          scope,
        });
      }

      return tx.execution.update({
        where: { id: current.id },
        data: { text: event.text, sequence: { increment: 1 } },
      });
    });

    return executionRecord(job);
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
          await this.settlement.finish(tx, current, 'timed_out');
        }
      });
    }

    await this.db.streamTicket.deleteMany({
      where: { expiresAt: { lte: this.now() } },
    });

    return overdue.length;
  }
}
