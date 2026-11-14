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

const DELIVERY_DEADLINE_MS = 18_000;

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

  /** Clears the learner's verdict. Tracing keeps the last score it received. */
  async clear(userId: string, executionId: string) {
    // Foreign or missing executions fail as not found before anything is deleted.
    await this.answers.answer(userId, executionId);

    await this.feedback.remove(userId, executionId);
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
    // Leave room for one bounded six-second transport and database acknowledgement.
    const deadline = this.clock().getTime() + DELIVERY_DEADLINE_MS;
    const results: AnswerFeedback[] = [];

    while (
      results.length < DELIVERY_BATCH &&
      this.clock().getTime() < deadline
    ) {
      const now = this.clock();
      const claimUntil = new Date(
        now.getTime() + DELIVERY_CLAIM_SECONDS * 1000,
      );
      const claimed = await this.feedback.claimDue(
        now,
        claimUntil,
        1,
        executionId,
      );
      if (claimed.length === 0) {
        break;
      }

      results.push(await this.send(claimed[0]));
      if (executionId) {
        break;
      }
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
