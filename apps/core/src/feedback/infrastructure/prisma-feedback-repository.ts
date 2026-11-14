import type { AnswerFeedback as AnswerFeedbackRow } from '@prisma/client';
import { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import type {
  AnswerFeedback,
  FeedbackWrite,
  Rating,
} from '../domain/feedback.js';
import type { FeedbackRepository } from '../domain/ports/feedback-repository.js';

type ClaimedRow = {
  execution_id: string;
  rating: string;
  cleared: boolean;
  hallucination: boolean;
  revision: number;
  delivered_revision: number;
  delivery_attempts: number;
  next_delivery_at: Date | null;
  updated_at: Date;
};

export class PrismaFeedbackRepository implements FeedbackRepository {
  constructor(private readonly db: PrismaService) {}

  async forUser(userId: string, executionIds: string[]) {
    if (executionIds.length === 0) {
      return [];
    }

    const rows = await this.db.answerFeedback.findMany({
      where: { userId, executionId: { in: executionIds }, cleared: false },
    });

    return rows.map(toFeedback);
  }

  async write(
    userId: string,
    executionId: string,
    now: Date,
    plan: (current: AnswerFeedback | null) => FeedbackWrite | null,
  ) {
    const row = await this.db.$transaction(async (tx) => {
      // The execution row lock serializes concurrent verdicts on one answer.
      await tx.$queryRaw`SELECT id FROM core.execution WHERE id = ${executionId}::uuid FOR UPDATE`;

      const current = await tx.answerFeedback.findFirst({
        where: { executionId, userId },
      });
      const change = plan(current ? toFeedback(current) : null);

      if (change === null) {
        return current!;
      }

      // A send in flight keeps its claim; the new revision waits for it instead of racing it.
      const claimed = current?.nextDeliveryAt;
      const nextDeliveryAt = claimed && claimed > now ? claimed : now;

      return tx.answerFeedback.upsert({
        where: { executionId },
        create: {
          executionId,
          userId,
          ...change,
          cleared: false,
          nextDeliveryAt,
          updatedAt: now,
        },
        update: {
          ...change,
          cleared: false,
          deliveryAttempts: 0,
          nextDeliveryAt,
          updatedAt: now,
        },
      });
    });

    return toFeedback(row);
  }

  async remove(userId: string, executionId: string) {
    await this.db.$transaction(async (tx) => {
      // Same lock as `write`, so a clear and a verdict on one answer never interleave.
      await tx.$queryRaw`SELECT id FROM core.execution WHERE id = ${executionId}::uuid FOR UPDATE`;

      await tx.answerFeedback.updateMany({
        where: { executionId, userId, cleared: false },
        data: { cleared: true },
      });
    });
  }

  async claimDue(
    now: Date,
    claimUntil: Date,
    limit: number,
    executionId?: string,
  ) {
    const rows = await this.db.$queryRaw<ClaimedRow[]>`
      WITH due AS (
        SELECT execution_id
        FROM core.answer_feedback
        WHERE NOT cleared AND delivered_revision < revision
          AND next_delivery_at <= ${now}
          AND (${executionId ?? null}::uuid IS NULL OR execution_id = ${executionId ?? null}::uuid)
        ORDER BY next_delivery_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE core.answer_feedback AS feedback
      SET next_delivery_at = ${claimUntil}
      FROM due
      WHERE feedback.execution_id = due.execution_id
      RETURNING feedback.*`;

    return rows.map(fromClaimed);
  }

  async delivered(executionId: string, revision: number) {
    await this.db.$executeRaw`
      UPDATE core.answer_feedback
      SET delivered_revision = ${revision},
          delivery_attempts = CASE WHEN revision = ${revision} THEN 0 ELSE delivery_attempts END,
          next_delivery_at = CASE WHEN revision = ${revision} THEN NULL ELSE next_delivery_at END
      WHERE execution_id = ${executionId}::uuid
        AND delivered_revision < ${revision}`;
  }

  async deferred(executionId: string, revision: number, retryAt: Date) {
    // A newer revision written meanwhile keeps its own, earlier schedule.
    await this.db.answerFeedback.updateMany({
      where: { executionId, revision },
      data: { deliveryAttempts: { increment: 1 }, nextDeliveryAt: retryAt },
    });
  }
}

function toFeedback(row: AnswerFeedbackRow): AnswerFeedback {
  return {
    executionId: row.executionId,
    rating: row.rating as Rating,
    cleared: row.cleared,
    hallucination: row.hallucination,
    revision: row.revision,
    deliveredRevision: row.deliveredRevision,
    deliveryAttempts: row.deliveryAttempts,
    nextDeliveryAt: row.nextDeliveryAt,
    updatedAt: row.updatedAt,
  };
}

function fromClaimed(row: ClaimedRow): AnswerFeedback {
  return {
    executionId: row.execution_id,
    rating: row.rating as Rating,
    cleared: row.cleared,
    hallucination: row.hallucination,
    revision: row.revision,
    deliveredRevision: row.delivered_revision,
    deliveryAttempts: row.delivery_attempts,
    nextDeliveryAt: row.next_delivery_at,
    updatedAt: row.updated_at,
  };
}
