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

  it('rejects an expired ticket and suppresses streaming after logout', async () => {
    context.deliveryStatus = 200;
    const job = await context.service.create(
      context.principal.user.id,
      context.workspaceId,
      {
        requestKey: randomUUID(),
        kind: 'chat',
        revision: 0,
        prompt: 'Review',
      },
    );
    const expired = await issueStreamTicket(
      context.stream,
      context.principal,
      job.id,
    );

    await context.db.streamTicket.updateMany({
      where: { executionId: job.id },
      data: { expiresAt: new Date(0) },
    });

    await expect(
      connectStream(
        context.stream,
        'expired',
        new URL(expired.url!).searchParams.get('ticket')!,
        'http://localhost:3000',
      ),
    ).rejects.toThrow('expired');

    const ticket = await issueStreamTicket(
      context.stream,
      context.principal,
      job.id,
    );

    await connectStream(
      context.stream,
      'logout',
      new URL(ticket.url!).searchParams.get('ticket')!,
      'http://localhost:3000',
    );

    const before = frames.length;

    await context.db.authSession.update({
      where: { id: context.principal.session.id },
      data: { revokedAt: new Date() },
    });
    await context.stream.broadcast(job.id);

    expect(frames).toHaveLength(before);
    await expect(context.stream.resume('logout')).rejects.toThrow('Unknown');
  });
});
