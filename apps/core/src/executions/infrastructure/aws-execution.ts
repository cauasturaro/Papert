import { createHash, randomBytes } from 'node:crypto';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { ExecutionQueue } from '../domain/execution.js';

import { StreamConnectionClosed } from '../domain/stream.js';
import type {
  StreamTickets,
  StreamGrant,
  StreamAuthorization,
  StreamConnection,
  StreamConnections,
  StreamDelivery,
} from '../domain/stream.js';

const awsOptions = () => ({
  region: process.env.AWS_REGION ?? 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL || undefined,
  maxAttempts: 3,
});
const hash = (ticket: string) =>
  createHash('sha256').update(ticket).digest('hex');

export class SqsExecutionQueue implements ExecutionQueue {
  private readonly client = new SQSClient(awsOptions());

  async publish(id: string) {
    if (!process.env.CHAT_QUEUE_URL) {
      throw new Error('CHAT_QUEUE_URL is required to publish executions.');
    }

    await this.client.send(
      new SendMessageCommand({
        QueueUrl: process.env.CHAT_QUEUE_URL,
        MessageBody: JSON.stringify({ version: 1, executionId: id }),
      }),
    );
  }
}

export class PrismaStreamTickets implements StreamTickets {
  constructor(private readonly db: PrismaService) {}

  generate() {
    return randomBytes(32).toString('base64url');
  }

  async replace(ticket: string, grant: StreamGrant, lifetimeMs: number) {
    await this.db.$transaction(async (tx) => {
      await tx.streamTicket.deleteMany({
        where: {
          executionId: grant.executionId,
          authSessionId: grant.authSessionId,
        },
      });
      await tx.streamTicket.create({
        data: {
          hash: hash(ticket),
          ...grant,
          expiresAt: new Date(Date.now() + lifetimeMs),
        },
      });
    });
  }

  async consume(ticket: string) {
    const tickets = await this.db.$queryRaw<
      {
        execution_id: string;
        auth_session_id: string;
        token_id: string;
      }[]
    >`DELETE FROM core.stream_ticket WHERE hash = ${hash(ticket)}
      AND expires_at > CURRENT_TIMESTAMP
      RETURNING execution_id, auth_session_id, token_id`;
    const grant = tickets[0];
    if (!grant) {
      return null;
    }

    return {
      executionId: grant.execution_id,
      authSessionId: grant.auth_session_id,
      tokenId: grant.token_id,
    };
  }
}

export class PrismaStreamAuthorization implements StreamAuthorization {
  constructor(private readonly db: PrismaService) {}

  async execution(id: string) {
    const job = await this.db.execution.findUniqueOrThrow({
      where: { id },
      include: { workspace: { include: { session: true } } },
    });

    return {
      id: job.id,
      userId: job.userId,
      sessionId: job.workspace.session!.id,
    };
  }

  async liveSession(connection: StreamConnection) {
    const session = await this.db.authSession.findFirst({
      where: {
        id: connection.authSessionId,
        userId: connection.userId,
        tokenId: connection.tokenId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    return !!session;
  }

  async ownsExecution(connection: StreamConnection) {
    const job = await this.db.execution.findFirst({
      where: {
        id: connection.executionId,
        userId: connection.userId,
        workspace: { session: { id: connection.sessionId } },
      },
    });

    return !!job;
  }
}

export class DynamoStreamConnections implements StreamConnections {
  private readonly dynamo = new DynamoDBClient(awsOptions());

  private get table() {
    return process.env.SESSIONS_TABLE ?? 'papert-sessions';
  }

  private decode(item: Record<string, { S?: string; N?: string }>) {
    const fields = Object.fromEntries(
      Object.entries(item).map(([key, value]) => [key, value.S ?? value.N]),
    );

    return { ...fields, expires: Number(item.expires.N) } as StreamConnection;
  }

  async put(connection: StreamConnection) {
    const { expires, ...fields } = connection;
    const item: Record<string, AttributeValue> = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, { S: value }]),
    );
    item.expires = { N: String(expires) };

    await this.dynamo.send(
      new PutItemCommand({
        TableName: this.table,
        Item: {
          ...item,
          pk: { S: `EXEC#${connection.executionId}` },
          sk: { S: `CONN#${connection.connectionId}` },
        },
      }),
    );
    await this.dynamo.send(
      new PutItemCommand({
        TableName: this.table,
        Item: {
          ...item,
          pk: { S: `CONN#${connection.connectionId}` },
          sk: { S: 'META' },
        },
      }),
    );
  }

  async get(connectionId: string) {
    const record = await this.dynamo.send(
      new GetItemCommand({
        TableName: this.table,
        Key: { pk: { S: `CONN#${connectionId}` }, sk: { S: 'META' } },
        ConsistentRead: true,
      }),
    );

    return record.Item ? this.decode(record.Item) : null;
  }

  async remove(connection: StreamConnection) {
    const connectionId = connection.connectionId;
    for (const [pk, sk] of [
      [`EXEC#${connection.executionId}`, `CONN#${connectionId}`],
      [`CONN#${connectionId}`, 'META'],
    ]) {
      await this.dynamo.send(
        new DeleteItemCommand({
          TableName: this.table,
          Key: { pk: { S: pk }, sk: { S: sk } },
        }),
      );
    }
  }

  async *forExecution(id: string) {
    let cursor: Record<string, AttributeValue> | undefined;
    do {
      const page = await this.dynamo.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': { S: `EXEC#${id}` } },
          ExclusiveStartKey: cursor,
          ConsistentRead: true,
        }),
      );

      for (const item of page.Items ?? []) {
        yield this.decode(item);
      }

      cursor = page.LastEvaluatedKey;
    } while (cursor);
  }
}

export class ApiGatewayStreamDelivery implements StreamDelivery {
  enabled() {
    return !!process.env.WEBSOCKET_MANAGEMENT_URL;
  }

  open() {
    const client = new ApiGatewayManagementApiClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      endpoint: process.env.WEBSOCKET_MANAGEMENT_URL,
      maxAttempts: 3,
    });

    return {
      async send(connectionId: string, snapshot: unknown) {
        try {
          await client.send(
            new PostToConnectionCommand({
              ConnectionId: connectionId,
              Data: Buffer.from(JSON.stringify(snapshot)),
            }),
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
