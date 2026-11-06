import { DomainError } from '../../common/domain/domain-error.js';

export class FeedbackError extends DomainError {}

export type Rating = 'up' | 'down';

/** A learner's verdict on one Seymour answer or evaluation, and its delivery to tracing. */
export type AnswerFeedback = {
  executionId: string;
  rating: Rating;
  hallucination: boolean;
  // Each learner change is a new revision; tracing has received `deliveredRevision`.
  revision: number;
  deliveredRevision: number;
  deliveryAttempts: number;
  nextDeliveryAt: Date | null;
  updatedAt: Date;
};

export type FeedbackInput = { rating: Rating; hallucination: boolean };

/** What feedback needs to know about the rated execution, read through its owner. */
export type RatedAnswer = { kind: string; status: string };

export type FeedbackWrite = {
  rating: Rating;
  hallucination: boolean;
  revision: number;
};

/** What tracing receives: the verdict of one revision, never the answer text. */
export type FeedbackSignal = {
  executionId: string;
  rating: Rating;
  hallucination: boolean;
  revision: number;
};

// Tutor answers and code evaluations are Seymour's answers; generation has its own preview.
export const RATED_KINDS = ['chat', 'analysis'];
export const FEEDBACK_LIST_LIMIT = 50;
export const DELIVERY_BATCH = 25;
// Longer than a delivery request may take, so one revision has a single sender at a time.
export const DELIVERY_CLAIM_SECONDS = 60;
const MAX_RETRY_MINUTES = 60;

export function assertRateable(answer: RatedAnswer) {
  if (!RATED_KINDS.includes(answer.kind)) {
    throw new FeedbackError('conflict', 'This result cannot be rated.');
  }
  if (answer.status !== 'completed') {
    throw new FeedbackError('conflict', 'Only finished answers can be rated.');
  }
}

/** The next revision to store, or null when the learner repeated their current verdict. */
export function feedbackChange(
  current: AnswerFeedback | null,
  input: FeedbackInput,
): FeedbackWrite | null {
  if (input.hallucination && input.rating === 'up') {
    throw new FeedbackError(
      'invalid',
      'Reporting a hallucination also rates the answer down.',
    );
  }

  const unchanged =
    current !== null &&
    current.rating === input.rating &&
    current.hallucination === input.hallucination;

  if (unchanged) {
    return null;
  }

  return {
    rating: input.rating,
    hallucination: input.hallucination,
    revision: (current?.revision ?? 0) + 1,
  };
}

export function pendingDelivery(feedback: AnswerFeedback) {
  return feedback.deliveredRevision < feedback.revision;
}

/** Exponential retry after a failed delivery, capped so a long outage retries hourly. */
export function retryAt(attempts: number, now: Date) {
  const minutes = Math.min(MAX_RETRY_MINUTES, 2 ** attempts);

  return new Date(now.getTime() + minutes * 60_000);
}

export function signalOf(feedback: AnswerFeedback): FeedbackSignal {
  return {
    executionId: feedback.executionId,
    rating: feedback.rating,
    hallucination: feedback.hallucination,
    revision: feedback.revision,
  };
}
