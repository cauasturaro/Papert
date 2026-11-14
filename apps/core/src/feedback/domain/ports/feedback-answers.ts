import type { RatedAnswer } from '../feedback.js';

/** Implemented over Executions' public service; feedback never reads execution tables. */
export interface FeedbackAnswers {
  /** The learner's own execution; foreign or missing ids fail as not found. */
  answer(userId: string, executionId: string): Promise<RatedAnswer>;
}
