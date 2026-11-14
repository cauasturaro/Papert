import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { ExecutionQueue } from '../domain/ports/execution-queue.js';
import { awsOptions } from './aws-client-options.js';

export class SqsExecutionQueue implements ExecutionQueue {
  private readonly client = new SQSClient(awsOptions());

  async publish(id: string) {
    if (!process.env.CHAT_QUEUE_URL) {
      throw new Error('CHAT_QUEUE_URL is required to publish executions.');
    }

    await this.client.send(
      new SendMessageCommand({
        QueueUrl: process.env.CHAT_QUEUE_URL,
        MessageBody: JSON.stringify({ version: 1, executionId: id }),
      }),
    );
  }
}
