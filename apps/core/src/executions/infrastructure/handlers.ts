import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { z } from 'zod';
import { AppModule } from '../../app.module.js';
import { ExecutionService } from '../application/execution.service.js';
import { ExecutionStream } from './aws-execution.js';

let context: Promise<INestApplicationContext> | undefined;

async function services() {
  context ??= NestFactory.createApplicationContext(AppModule);
  const app = await context;

  return {
    executions: app.get(ExecutionService),
    stream: app.get(ExecutionStream),
  };
}

const rpcSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('claim'), executionId: z.string().uuid() })
    .strict(),
  z
    .object({
      action: z.literal('failed'),
      executionId: z.string().uuid(),
      lease: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('active'),
      executionId: z.string().uuid(),
      lease: z.string().uuid(),
    })
    .strict(),
]);

// This Lambda has no HTTP event. Only the Seymour role may invoke it through IAM.
export async function workerControl(event: unknown) {
  const request = rpcSchema.parse(event);
  const { executions } = await services();

  if (request.action === 'claim') {
    return executions.claim(request.executionId);
  }

  if (request.action === 'failed') {
    const result = await executions.failed(request.executionId, request.lease);
    console.info(
      JSON.stringify({
        metric: 'execution_attempt_failure',
        executionId: request.executionId,
        status: result.status,
      }),
    );

    return result;
  }

  return {
    active: await executions.active(request.executionId, request.lease),
  };
}

export async function results(event: {
  Records: { messageId: string; body: string }[];
}) {
  const { executions, stream } = await services();
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      const snapshot = await executions.accept(JSON.parse(record.body));
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
    } catch {
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
  const { stream } = await services();
  const { routeKey, connectionId } = event.requestContext;

  try {
    if (routeKey === '$connect') {
      await stream.connect(
        connectionId,
        event.queryStringParameters?.ticket ?? '',
        event.headers?.origin ?? event.headers?.Origin ?? '',
      );
    } else if (routeKey === '$disconnect') {
      await stream.disconnect(connectionId);
    } else {
      z.object({ action: z.literal('resume') })
        .strict()
        .parse(JSON.parse(event.body ?? '{}'));

      await stream.resume(connectionId);
    }

    return { statusCode: 200, body: '' };
  } catch {
    return { statusCode: 403, body: 'Stream access denied.' };
  }
}
