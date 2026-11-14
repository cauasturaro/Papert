import { pendingDelivery, type AnswerFeedback } from '../domain/feedback.js';

export function feedbackView(feedback: AnswerFeedback) {
  return {
    executionId: feedback.executionId,
    rating: feedback.rating,
    hallucination: feedback.hallucination,
    // Shown to the learner as "sent" once tracing has the latest verdict.
    delivered: !pendingDelivery(feedback),
    updatedAt: feedback.updatedAt,
  };
}
