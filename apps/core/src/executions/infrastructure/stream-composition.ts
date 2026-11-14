import { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import { ExecutionStreamService } from '../application/execution-stream.service.js';
import type { StreamExecutions } from '../domain/ports/stream-executions.js';
import { ApiGatewayStreamDelivery } from './api-gateway-stream-delivery.js';
import { DynamoStreamConnections } from './dynamo-stream-connections.js';
import { PrismaStreamAuthorization } from './prisma-stream-authorization.js';
import { PrismaStreamTickets } from './prisma-stream-tickets.js';

export function streamEndpoint() {
  const url = process.env.WEBSOCKET_URL;
  if (
    url &&
    !url.startsWith('wss://') &&
    process.env.NODE_ENV === 'production'
  ) {
    throw new Error('WEBSOCKET_URL must use WSS in production.');
  }

  return url;
}

export function createExecutionStream(
  db: PrismaService,
  executions: StreamExecutions,
) {
  return new ExecutionStreamService(
    executions,
    new PrismaStreamTickets(db),
    new PrismaStreamAuthorization(db),
    new DynamoStreamConnections(),
    new ApiGatewayStreamDelivery(),
    () => ({ enabled: !!streamEndpoint() }),
  );
}
