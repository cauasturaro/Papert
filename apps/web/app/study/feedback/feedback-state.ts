import type { AnswerFeedback, FeedbackInput } from "./feedback-api.ts";

export type FeedbackAction = "up" | "down" | "report" | "unreport";

/** The verdict a click produces; a hallucination report always rates the answer down. */
export function nextFeedback(action: FeedbackAction): FeedbackInput {
  if (action === "up") {
    return { rating: "up", hallucination: false };
  }

  if (action === "report") {
    return { rating: "down", hallucination: true };
  }

  return { rating: "down", hallucination: false };
}

/** Repeating the current verdict sends nothing. */
export function changes(
  current: AnswerFeedback | undefined,
  input: FeedbackInput,
) {
  if (!current) {
    return true;
  }

  return (
    current.rating !== input.rating ||
    current.hallucination !== input.hallucination
  );
}

export function confirmation(feedback: AnswerFeedback | undefined) {
  if (!feedback) {
    return "";
  }

  if (!feedback.delivered) {
    return "Saved. Papert will send it to quality review shortly.";
  }

  if (feedback.hallucination) {
    return "Reported. Thank you for helping make Seymour more accurate.";
  }

  return "Thanks, your rating was sent to quality review.";
}

/** Sorted ids make one cache entry per set of answers on screen. */
export function feedbackIds(ids: string[]) {
  return [...new Set(ids)].sort();
}
