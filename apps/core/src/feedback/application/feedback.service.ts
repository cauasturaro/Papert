import type { Clock } from '../../common/domain/runtime.js';
import {
  DELIVERY_BATCH,
  DELIVERY_CLAIM_SECONDS,
  assertRateable,
  feedbackChange,
  retryAt,
  signalOf,
  type AnswerFeedback,
} from '../domain/feedback.js';
import type { FeedbackAnswers } from '../domain/ports/feedback-answers.js';
import type { FeedbackRepository } from '../domain/ports/feedback-repository.js';
import type { FeedbackSink } from '../domain/ports/feedback-sink.js';
import {
  executionIdsSchema,
  feedbackSchema,
  parse,
} from './contracts/feedback.contract.js';
import { feedbackView } from './feedback-presentation.js';

/** Learner verdicts on Seymour's answers, stored first and then sent to tracing. */
export class FeedbackService {
  constructor(
    private readonly feedback: FeedbackRepository,
    private readonly answers: FeedbackAnswers,
    private readonly sink: FeedbackSink,
    private readonly clock: Clock,
  ) {}

  async rate(userId: string, executionId: string, body: unknown) {
    const input = parse(feedbackSchema, body);

    const answer = await this.answers.answer(userId, executionId);
    assertRateable(answer);

    const stored = await this.feedback.write(
      userId,
      executionId,
      this.clock(),
      (current) => feedbackChange(current, input),
    );

    // Best effort: a failed send stays pending for the scheduled delivery.
    const sent = await this.deliver(executionId);

    return feedbackView(sent[0] ?? stored);
  }

  async list(userId: string, executionIds: unknown) {
    const ids = parse(executionIdsSchema, executionIds ?? '');

    const items = await this.feedback.forUser(userId, ids);

    return items.map(feedbackView);
  }

  /** Scheduled retry of every revision that tracing has not received yet. */
  async deliverDue() {
    const sent = await this.deliver();
    const delivered = sent.filter(
      (item) => item.deliveredRevision === item.revision,
    );

    return { claimed: sent.length, delivered: delivered.length };
  }

  private async deliver(executionId?: string): Promise<AnswerFeedback[]> {
    const now = this.clock();
    const claimUntil = new Date(now.getTime() + DELIVERY_CLAIM_SECONDS * 1000);

    const claimed = await this.feedback.claimDue(
      now,
      claimUntil,
      DELIVERY_BATCH,
      executionId,
    );

    const results: AnswerFeedback[] = [];

    for (const item of claimed) {
      results.push(await this.send(item));
    }

    return results;
  }

  private async send(item: AnswerFeedback): Promise<AnswerFeedback> {
    try {
      await this.sink.send(signalOf(item));
    } catch {
      const attempts = item.deliveryAttempts + 1;
      const next = retryAt(attempts, this.clock());

      await this.feedback.deferred(item.executionId, item.revision, next);

      return { ...item, deliveryAttempts: attempts, nextDeliveryAt: next };
    }

    await this.feedback.delivered(item.executionId, item.revision);

    return { ...item, deliveredRevision: item.revision, nextDeliveryAt: null };
  }
}
