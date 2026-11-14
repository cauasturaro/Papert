import type { FeedbackSignal } from '../feedback.js';

/** Where learner verdicts go (Langfuse); sending the same revision twice is harmless. */
export interface FeedbackSink {
  send(signal: FeedbackSignal): Promise<void>;
}
