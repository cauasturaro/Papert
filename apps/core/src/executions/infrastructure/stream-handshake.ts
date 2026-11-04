import { ExecutionStreamService } from '../application/execution-stream.service.js';
import { ExecutionError } from '../domain/execution.js';
import type { StreamPrincipal } from '../domain/stream.js';
import { streamEndpoint } from './stream-composition.js';

export async function issueStreamTicket(
  stream: ExecutionStreamService,
  principal: StreamPrincipal,
  id: string,
) {
  const { ticket } = await stream.ticket(principal, id);

  return {
    url: ticket === null ? null : `${streamEndpoint()}?ticket=${ticket}`,
  };
}

export async function connectStream(
  stream: ExecutionStreamService,
  connectionId: string,
  ticket: string,
  origin: string,
) {
  if (
    origin !== (process.env.WEB_ORIGIN ?? 'http://localhost:3000') ||
    !/^[A-Za-z0-9_-]{43}$/.test(ticket)
  ) {
    throw new ExecutionError('forbidden', 'Invalid stream handshake.');
  }

  await stream.connect(connectionId, ticket);
}
