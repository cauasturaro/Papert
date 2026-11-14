import { createJsonRequest } from "@/lib/api/request";

export type Rating = "up" | "down";

/** The learner's verdict on one Seymour answer or analysis. */
export type AnswerFeedback = {
  executionId: string;
  rating: Rating;
  hallucination: boolean;
  // True once Papert's tracing received the latest verdict.
  delivered: boolean;
  updatedAt: string;
};

export type FeedbackInput = { rating: Rating; hallucination: boolean };

const request = createJsonRequest({
  base: "/api/feedback",
  unauthorized: "Sign in to rate Seymour's answers.",
  unavailable: "Feedback is unavailable. Try again.",
});

export function listFeedback(executionIds: string[]) {
  const query = new URLSearchParams({ executions: executionIds.join(",") });

  return request<AnswerFeedback[]>(`list?${query}`);
}

/** Removes the learner's verdict; Core requires a JSON body on every mutation. */
export function clearRating(executionId: string) {
  return request<void>(`executions/${executionId}`, "DELETE", {});
}

export function rateAnswer(executionId: string, input: FeedbackInput) {
  return request<AnswerFeedback>(`executions/${executionId}`, "PUT", input);
}
