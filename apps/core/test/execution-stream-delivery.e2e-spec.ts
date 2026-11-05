import { QueryCommand } from '@aws-sdk/client-dynamodb';
import { ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { randomUUID } from 'node:crypto';
import {
  connectStream,
  issueStreamTicket,
} from '../src/executions/infrastructure/stream-handshake.js';
import { executionStreamHarness } from './support/execution-stream.js';

describe.skipIf(
  !process.env.AUTH_TEST_DATABASE_URL ||
    !process.env.EXECUTION_TEST_AWS_ENDPOINT,
)('SQS + DynamoDB + signed stream delivery', () => {
  const context = executionStreamHarness();
  const { frames } = context;

  it('publishes only the execution identity and persists authorized session mappings, with replay-safe tickets and signed snapshots', async () => {
    const job = await context.service.create(
      context.principal.user.id,
      context.workspaceId,
      {
        requestKey: randomUUID(),
        kind: 'chat',
        revision: 0,
        prompt: 'Help',
      },
    );
    const messages = await context.sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: context.queueUrl,
        MaxNumberOfMessages: 1,
      }),
    );

    expect(JSON.parse(messages.Messages![0].Body!)).toEqual({
      version: 1,
      executionId: job.id,
    });

    const ticket = await issueStreamTicket(
      context.stream,
      context.principal,
      job.id,
    );
    const secret = new URL(ticket.url!).searchParams.get('ticket')!;

    await expect(
      connectStream(context.stream, 'bad', secret, 'https://attacker.example'),
    ).rejects.toThrow('handshake');

    await connectStream(
      context.stream,
      'first',
      secret,
      'http://localhost:3000',
    );

    await expect(
      connectStream(
        context.stream,
        'replayed',
        secret,
        'http://localhost:3000',
      ),
    ).rejects.toThrow('already used');

    await context.stream.resume('first');

    expect(frames.at(-1)!.authorization).toContain('AWS4-HMAC-SHA256');
    expect(frames.at(-1)!.path).toBe('/@connections/first');
    expect(frames.at(-1)!.body.id).toBe(job.id);
    expect(frames.at(-1)!.body).not.toHaveProperty('input');

    const mapping = await context.dynamo.send(
      new QueryCommand({
        TableName: context.table,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': { S: `EXEC#${job.id}` } },
      }),
    );

    expect(mapping.Items![0].userId.S).toBe(context.principal.user.id);
    expect(mapping.Items![0].sessionId.S).toBeDefined();

    const claim = await context.worker.claim(job.id);
    const progressEvent = {
      version: 1,
      executionId: job.id,
      lease: claim.lease,
      index: 1,
      status: 'running',
      text: 'First batch',
      tokens: 0,
    };

    await context.worker.accept(progressEvent);

    await context.stream.broadcast(job.id);

    expect(frames.at(-1)!.body.text).toBe('First batch');
    expect(frames.at(-1)!.body.status).toBe('running');

    await context.stream.disconnect('first');

    const renewed = await issueStreamTicket(
      context.stream,
      context.principal,
      job.id,
    );

    await connectStream(
      context.stream,
      'second',
      new URL(renewed.url!).searchParams.get('ticket')!,
      'http://localhost:3000',
    );
    await context.stream.resume('second');

    expect(frames.at(-1)!.body.text).toBe('First batch');

    context.deliveryStatus = 500;
    await context.stream.broadcast(job.id);

    expect(
      (await context.service.owned(context.principal.user.id, job.id)).status,
    ).toBe('running');

    context.deliveryStatus = 410;
    await context.stream.broadcast(job.id);

    const stale = await context.dynamo.send(
      new QueryCommand({
        TableName: context.table,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': { S: `EXEC#${job.id}` } },
      }),
    );

    expect(stale.Items).toHaveLength(0);

    const completedEvent = {
      version: 1,
      executionId: job.id,
      lease: claim.lease,
      index: 3,
      status: 'completed',
      text: 'First batch and final',
      tokens: 0,
    };

    await context.worker.accept(completedEvent);

    expect(
      (await context.service.owned(context.principal.user.id, job.id)).status,
    ).toBe('completed');
  });
});
