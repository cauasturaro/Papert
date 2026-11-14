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

  beforeEach(() => {
    frames.length = 0;
    context.deliveryStatus = 200;
  });

  function createJob() {
    return context.service.create(
      context.principal.user.id,
      context.workspaceId,
      {
        requestKey: randomUUID(),
        kind: 'chat',
        revision: 0,
        prompt: 'Help',
      },
    );
  }

  async function connectJob(executionId: string, connectionId = randomUUID()) {
    const ticket = await issueStreamTicket(
      context.stream,
      context.principal,
      executionId,
    );
    const secret = new URL(ticket.url!).searchParams.get('ticket')!;

    await connectStream(
      context.stream,
      connectionId,
      secret,
      'http://localhost:3000',
    );

    return connectionId;
  }

  function mappings(executionId: string) {
    return context.dynamo.send(
      new QueryCommand({
        TableName: context.table,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': { S: `EXEC#${executionId}` } },
      }),
    );
  }

  it('publishes only the execution identity', async () => {
    const job = await createJob();

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
  });

  it('rejects an invalid origin without consuming the ticket and rejects replay', async () => {
    const job = await createJob();
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
  });

  it('persists authorized session mappings and sends signed public snapshots', async () => {
    const job = await createJob();
    const connectionId = await connectJob(job.id);

    await context.stream.resume(connectionId);
    const mapping = await mappings(job.id);

    expect(frames.at(-1)!.authorization).toContain('AWS4-HMAC-SHA256');
    expect(frames.at(-1)!.path).toBe(`/@connections/${connectionId}`);
    expect(frames.at(-1)!.body.id).toBe(job.id);
    expect(frames.at(-1)!.body).not.toHaveProperty('input');
    expect(mapping.Items![0].userId.S).toBe(context.principal.user.id);
    expect(mapping.Items![0].sessionId.S).toBeDefined();
  });

  it('delivers persisted progress after reconnection and then completion', async () => {
    const job = await createJob();
    const first = await connectJob(job.id);
    const claim = await context.worker.claim(job.id);
    const event = {
      version: 1,
      executionId: job.id,
      lease: claim.lease,
      index: 1,
      status: 'running',
      text: 'First batch',
      tokens: 0,
    };

    await context.worker.accept(event);
    await context.stream.broadcast(job.id);

    expect(frames.at(-1)!.body.text).toBe('First batch');
    expect(frames.at(-1)!.body.status).toBe('running');

    await context.stream.disconnect(first);
    const second = await connectJob(job.id);
    await context.stream.resume(second);

    expect(frames.at(-1)!.body.text).toBe('First batch');

    await context.worker.accept({
      ...event,
      index: 3,
      status: 'completed',
      text: 'First batch and final',
    });
    await context.stream.broadcast(job.id);
    const completed = await context.service.owned(
      context.principal.user.id,
      job.id,
    );

    expect(completed.status).toBe('completed');
    expect(frames.at(-1)!.body.status).toBe('completed');
    expect(frames.at(-1)!.body.text).toBe('First batch and final');
  });

  it('keeps persisted execution progress and connection mappings after HTTP 500', async () => {
    const job = await createJob();
    await connectJob(job.id);
    await context.worker.claim(job.id);
    context.deliveryStatus = 500;

    await context.stream.broadcast(job.id);
    const stored = await context.service.owned(
      context.principal.user.id,
      job.id,
    );
    const mapping = await mappings(job.id);

    expect(stored.status).toBe('running');
    expect(mapping.Items).toHaveLength(1);
  });

  it('removes stale connection mappings after HTTP 410', async () => {
    const job = await createJob();
    await connectJob(job.id);
    context.deliveryStatus = 410;

    await context.stream.broadcast(job.id);
    const stale = await mappings(job.id);

    expect(stale.Items).toHaveLength(0);
  });
});
