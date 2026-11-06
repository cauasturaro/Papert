import type { AnswerFeedback, FeedbackWrite } from '../feedback.js';

export interface FeedbackRepository {
  forUser(userId: string, executionIds: string[]): Promise<AnswerFeedback[]>;

  /** Locks the learner's row, applies the plan and returns the stored feedback. */
  write(
    userId: string,
    executionId: string,
    now: Date,
    plan: (current: AnswerFeedback | null) => FeedbackWrite | null,
  ): Promise<AnswerFeedback>;

  /** Claims due deliveries until `claimUntil`; another sender skips claimed rows. */
  claimDue(
    now: Date,
    claimUntil: Date,
    limit: number,
    executionId?: string,
  ): Promise<AnswerFeedback[]>;

  /** Marks `revision` as received; a newer learner revision stays pending. */
  delivered(executionId: string, revision: number): Promise<void>;

  deferred(executionId: string, revision: number, retryAt: Date): Promise<void>;
}
