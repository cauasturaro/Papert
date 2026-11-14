import { ExecutionError } from '../domain/execution.js';
import { connectStream } from './stream-handshake.js';
import { z } from 'zod';
import { applicationContext } from '../../lambda-context.js';
import { ExecutionService } from '../application/execution.service.js';
import { ExecutionWorkerService } from '../application/execution-worker.service.js';
import { ExecutionStreamService } from '../application/execution-stream.service.js';

async function services() {
  const app = await applicationContext();

  return {
    executions: app.get(ExecutionService),
    worker: app.get(ExecutionWorkerService),
    stream: app.get(ExecutionStreamService),
  };
}

const rpcSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('claim'),
    executionId: z.guid(),
    claimId: z.guid(),
  }),
  z.strictObject({
    action: z.literal('failed'),
    executionId: z.guid(),
    lease: z.guid(),
  }),
  z.strictObject({
    action: z.literal('active'),
    executionId: z.guid(),
    lease: z.guid(),
  }),
  z.strictObject({
    action: z.literal('sources'),
    executionId: z.guid(),
    lease: z.guid(),
  }),
]);

// This Lambda has no HTTP event. Only the Seymour role may invoke it through IAM.
export async function workerControl(event: unknown) {
  const request = rpcSchema.parse(event);
  const { worker } = await services();

  if (request.action === 'claim') {
    return worker.claim(request.executionId, request.claimId);
  }

  if (request.action === 'failed') {
    const result = await worker.failed(request.executionId, request.lease);
    console.info(
      JSON.stringify({
        metric: 'execution_attempt_failure',
        executionId: request.executionId,
        status: result.status,
      }),
    );

    return result;
  }

  if (request.action === 'sources') {
    return {
      sourceIds: await worker.liveSources(request.executionId, request.lease),
    };
  }

  return {
    active: await worker.active(request.executionId, request.lease),
  };
}

export async function results(event: {
  Records: {
    messageId: string;
    body: string;
    attributes?: { ApproximateReceiveCount?: string };
  }[];
}) {
  const { worker, stream } = await services();
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    let executionId: string | undefined;

    try {
      const payload: unknown = JSON.parse(record.body);
      const correlation = z
        .object({ executionId: z.guid() })
        .safeParse(payload);
      executionId = correlation.success
        ? correlation.data.executionId
        : undefined;

      const snapshot = await worker.accept(payload);
      console.info(
        JSON.stringify({
          metric: 'execution_update',
          executionId: snapshot.id,
          status: snapshot.status,
          attempts: snapshot.attempts,
          charged: snapshot.charged,
          queueMs: snapshot.firstEventAt
            ? snapshot.firstEventAt.getTime() - snapshot.createdAt.getTime()
            : null,
          durationMs: snapshot.finishedAt
            ? snapshot.finishedAt.getTime() - snapshot.createdAt.getTime()
            : null,
        }),
      );

      // Persistence succeeds independently of the ephemeral streaming channel.
      try {
        await stream.broadcast(snapshot.id);
      } catch {
        console.warn(
          JSON.stringify({
            metric: 'stream_delivery_failure',
            executionId: snapshot.id,
          }),
        );
      }
    } catch (error) {
      const category =
        error instanceof SyntaxError ||
        error instanceof z.ZodError ||
        (error instanceof Error && 'kind' in error && error.kind === 'invalid')
          ? 'invalid_payload'
          : 'processing_failure';

      console.warn(
        JSON.stringify({
          metric: 'execution_result_failure',
          messageId: record.messageId,
          executionId,
          receiveCount: record.attributes?.ApproximateReceiveCount,
          category,
        }),
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}

export async function maintenance() {
  const { executions } = await services();

  const result = await executions.sweep();
  console.info(JSON.stringify({ metric: 'execution_maintenance', ...result }));

  return result;
}

type WebsocketEvent = {
  requestContext: { routeKey: string; connectionId: string };
  headers?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  body?: string;
};

export async function websocket(event: WebsocketEvent) {
  const { routeKey, connectionId } = event.requestContext;

  try {
    const { stream } = await services();

    if (routeKey === '$connect') {
      await connectStream(
        stream,
        connectionId,
        event.queryStringParameters?.ticket ?? '',
        event.headers?.origin ?? event.headers?.Origin ?? '',
      );
    } else if (routeKey === '$disconnect') {
      await stream.disconnect(connectionId);
    } else {
      z.strictObject({ action: z.literal('resume') }).parse(
        JSON.parse(event.body ?? '{}'),
      );

      await stream.resume(connectionId);
    }

    return { statusCode: 200, body: '' };
  } catch (error) {
    return websocketFailure(error);
  }
}

export function websocketFailure(error: unknown) {
  const expected =
    error instanceof SyntaxError ||
    error instanceof z.ZodError ||
    (error instanceof ExecutionError &&
      [
        'invalid',
        'unauthenticated',
        'forbidden',
        'not_found',
        'conflict',
        'rate_limited',
      ].includes(error.kind));

  if (expected) {
    return { statusCode: 403, body: 'Stream access denied.' };
  }

  console.error(JSON.stringify({ metric: 'stream_request_failure' }));

  return { statusCode: 500, body: 'Stream temporarily unavailable.' };
}
