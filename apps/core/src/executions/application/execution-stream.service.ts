import { StreamConnectionClosed } from '../domain/stream.js';
import { ExecutionError } from '../domain/execution.js';
import type {
  StreamPrincipal,
  StreamConnection,
  StreamSettings,
} from '../domain/stream.js';
import type { StreamTickets } from '../domain/ports/stream-tickets.js';
import type { StreamAuthorization } from '../domain/ports/stream-authorization.js';
import type { StreamConnections } from '../domain/ports/stream-connections.js';
import type { StreamDelivery } from '../domain/ports/stream-delivery.js';
import type { StreamExecutions } from '../domain/ports/stream-executions.js';

const STREAM_TICKET_MS = 60_000;
const STREAM_CONNECTION_SECONDS = 900;
const MAX_STREAM_CONNECTIONS = 8;
const FANOUT_TIMEOUT_MS = 2000;

export class ExecutionStreamService {
  constructor(
    private readonly executions: StreamExecutions,
    private readonly tickets: StreamTickets,
    private readonly authorization: StreamAuthorization,
    private readonly connections: StreamConnections,
    private readonly delivery: StreamDelivery,
    private readonly settings: () => StreamSettings,
    private readonly now = () => new Date(),
  ) {}

  async ticket(principal: StreamPrincipal, id: string) {
    await this.executions.owned(principal.user.id, id);

    const settings = this.settings();
    if (!settings.enabled) {
      return { ticket: null };
    }

    const ticket = this.tickets.generate();
    await this.tickets.replace(
      ticket,
      {
        executionId: id,
        authSessionId: principal.session.id,
        tokenId: principal.session.tokenId,
      },
      STREAM_TICKET_MS,
    );

    return { ticket };
  }

  private async authorized(connection: StreamConnection) {
    if (connection.expires <= this.now().getTime() / 1000) {
      return false;
    }

    const session = await this.authorization.liveSession(connection);
    const owned = await this.authorization.ownsExecution(connection);

    return session && owned;
  }

  async connect(connectionId: string, ticket: string) {
    const grant = await this.tickets.consume(ticket);
    if (!grant) {
      throw new ExecutionError(
        'forbidden',
        'Stream ticket expired or already used.',
      );
    }

    const job = await this.authorization.execution(grant.executionId);

    const connection: StreamConnection = {
      connectionId,
      executionId: job.id,
      userId: job.userId,
      authSessionId: grant.authSessionId,
      tokenId: grant.tokenId,
      sessionId: job.sessionId,
      expires:
        Math.floor(this.now().getTime() / 1000) + STREAM_CONNECTION_SECONDS,
    };
    if (!(await this.authorized(connection))) {
      throw new ExecutionError(
        'forbidden',
        'Stream session is no longer active.',
      );
    }

    // Best-effort admission: concurrent connects can briefly exceed the limit. A strict cap
    // would need an atomic counter in the connection store.
    let count = 0;
    for await (const existing of this.connections.forExecution(job.id)) {
      if (existing.expires > this.now().getTime() / 1000) {
        count += 1;
      }
      if (count >= MAX_STREAM_CONNECTIONS) {
        throw new ExecutionError(
          'conflict',
          'Too many streams for this execution.',
        );
      }
    }

    await this.connections.put(connection);
  }

  async disconnect(connectionId: string) {
    const connection = await this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    await this.connections.remove(connection);
  }

  async resume(connectionId: string) {
    const connection = await this.connections.get(connectionId);
    if (!connection) {
      throw new ExecutionError('forbidden', 'Unknown stream connection.');
    }

    await this.send(connection);
  }

  private async send(connection: StreamConnection) {
    if (!(await this.authorized(connection))) {
      await this.disconnect(connection.connectionId);

      return;
    }

    const job = await this.executions.owned(
      connection.userId,
      connection.executionId,
    );
    const delivery = this.delivery.open();

    try {
      await this.deliverSnapshot(delivery, connection, job.id, () =>
        this.executions.snapshot(job),
      );
    } finally {
      delivery.close();
    }
  }

  async broadcast(id: string) {
    if (!this.delivery.enabled()) {
      return;
    }

    const controller = new AbortController();
    const delivery = this.delivery.open();
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve();
      }, FANOUT_TIMEOUT_MS);
    });

    try {
      await Promise.race([
        this.fanout(id, delivery, controller.signal),
        deadline,
      ]);
    } finally {
      controller.abort();
      clearTimeout(timer);
      delivery.close();
    }
  }

  private async fanout(
    id: string,
    delivery: ReturnType<StreamDelivery['open']>,
    signal: AbortSignal,
  ) {
    let count = 0;
    let snapshot: unknown;

    for await (const connection of this.connections.forExecution(id)) {
      if (signal.aborted || count >= MAX_STREAM_CONNECTIONS) {
        break;
      }
      count += 1;

      if (!(await this.authorized(connection))) {
        await this.disconnect(connection.connectionId);
        continue;
      }

      if (snapshot === undefined) {
        const job = await this.executions.owned(connection.userId, id);
        snapshot = this.executions.snapshot(job);
      }
      if (signal.aborted) {
        break;
      }

      await this.deliverSnapshot(
        delivery,
        connection,
        id,
        () => snapshot,
        signal,
      );
    }
  }

  private async deliverSnapshot(
    delivery: ReturnType<StreamDelivery['open']>,
    connection: StreamConnection,
    executionId: string,
    snapshot: () => unknown,
    signal?: AbortSignal,
  ) {
    try {
      const message = snapshot();

      await delivery.send(connection.connectionId, message, signal);
    } catch (error) {
      if (error instanceof StreamConnectionClosed) {
        await this.disconnect(connection.connectionId);
      } else if (!signal?.aborted) {
        console.warn(
          JSON.stringify({ metric: 'stream_delivery_failure', executionId }),
        );
      }
    }
  }
}
