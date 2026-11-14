import type { ExecutionService } from '../../executions/application/execution.service.js';
import type { FeedbackAnswers } from '../domain/ports/feedback-answers.js';

/** Reads the rated execution through the executions module's public service. */
export class ExecutionServiceAnswers implements FeedbackAnswers {
  constructor(private readonly executions: ExecutionService) {}

  async answer(userId: string, executionId: string) {
    const job = await this.executions.owned(userId, executionId);
    const view = this.executions.snapshot(job);

    return { kind: view.kind, status: view.status };
  }
}
