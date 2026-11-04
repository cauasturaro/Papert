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
      60000,
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
      expires: Math.floor(this.now().getTime() / 1000) + 900,
    };
    if (!(await this.authorized(connection))) {
      throw new ExecutionError(
        'forbidden',
        'Stream session is no longer active.',
      );
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
      const snapshot = this.executions.snapshot(job);

      await delivery.send(connection.connectionId, snapshot);
    } catch (error) {
      if (error instanceof StreamConnectionClosed) {
        await this.disconnect(connection.connectionId);
      } else {
        // HTTP resume recovers snapshots when the delivery channel is unavailable.
        console.warn(
          JSON.stringify({
            metric: 'stream_delivery_failure',
            executionId: job.id,
          }),
        );
      }
    } finally {
      delivery.close();
    }
  }

  async broadcast(id: string) {
    if (!this.delivery.enabled()) {
      return;
    }

    for await (const connection of this.connections.forExecution(id)) {
      await this.send(connection);
    }
  }
}
