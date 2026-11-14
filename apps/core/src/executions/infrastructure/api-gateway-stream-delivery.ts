import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import type { StreamDelivery } from '../domain/ports/stream-delivery.js';
import { StreamConnectionClosed } from '../domain/stream.js';

export function streamPayload(snapshot: unknown) {
  const full = Buffer.from(JSON.stringify(snapshot));
  if (full.byteLength <= 32 * 1024) {
    return full;
  }

  // HTTP retains complete grounding; old clients can still render this valid snapshot.
  const compact = {
    ...(snapshot as Record<string, unknown>),
    grounding: null,
    requiresRefresh: true,
  };
  const payload = Buffer.from(JSON.stringify(compact));
  if (payload.byteLength > 32 * 1024) {
    throw new Error('Execution snapshot exceeds the stream frame limit.');
  }

  return payload;
}

export class ApiGatewayStreamDelivery implements StreamDelivery {
  enabled() {
    return !!process.env.WEBSOCKET_MANAGEMENT_URL;
  }

  open() {
    const client = new ApiGatewayManagementApiClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      endpoint: process.env.WEBSOCKET_MANAGEMENT_URL,
      maxAttempts: 1,
      requestHandler: { requestTimeout: 1500, connectionTimeout: 500 },
    });

    return {
      async send(
        connectionId: string,
        snapshot: unknown,
        signal?: AbortSignal,
      ) {
        try {
          await client.send(
            new PostToConnectionCommand({
              ConnectionId: connectionId,
              Data: streamPayload(snapshot),
            }),
            { abortSignal: signal },
          );
        } catch (error) {
          if (error instanceof Error && error.name === 'GoneException') {
            throw new StreamConnectionClosed();
          }

          throw error;
        }
      },
      close() {
        client.destroy();
      },
    };
  }
}
