import { applicationContext } from '../../lambda-context.js';
import { FeedbackService } from '../application/feedback.service.js';

/** Scheduled delivery of learner verdicts that Langfuse has not received yet. */
export async function maintenance() {
  const app = await applicationContext();

  const result = await app.get(FeedbackService).deliverDue();
  console.info(JSON.stringify({ metric: 'feedback_delivery', ...result }));

  return result;
}
