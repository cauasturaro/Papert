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
import type { Principal } from '../../auth/domain/auth.js';
import { StudyError } from '../../study/domain/study.js';
import { ExecutionService } from '../application/execution.service.js';
import type { ExecutionQueue } from '../domain/execution.js';

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

type Connection = {
  connectionId: string;
  executionId: string;
  userId: string;
  authSessionId: string;
  tokenId: string;
  sessionId: string;
  expires: string;
};

export class ExecutionStream {
  private readonly dynamo = new DynamoDBClient(awsOptions());

  constructor(
    private readonly db: PrismaService,
    private readonly executions: ExecutionService,
  ) {}

  private get table() {
    return process.env.SESSIONS_TABLE ?? 'papert-sessions';
  }

  async ticket(principal: Principal, id: string) {
    await this.executions.owned(principal.user.id, id);

    const url = process.env.WEBSOCKET_URL;
    if (!url) {
      return { url: null };
    }
    if (!url.startsWith('wss://') && process.env.NODE_ENV === 'production') {
      throw new Error('WEBSOCKET_URL must use WSS in production.');
    }

    const ticket = randomBytes(32).toString('base64url');
    await this.db.$transaction(async (tx) => {
      await tx.streamTicket.deleteMany({
        where: { executionId: id, authSessionId: principal.session.id },
      });
      await tx.streamTicket.create({
        data: {
          hash: hash(ticket),
          executionId: id,
          authSessionId: principal.session.id,
          tokenId: principal.session.tokenId,
          expiresAt: new Date(Date.now() + 60000),
        },
      });
    });

    return { url: `${url}?ticket=${ticket}` };
  }

  private async authorized(connection: Connection) {
    if (Number(connection.expires) <= Date.now() / 1000) {
      return false;
    }

    const session = await this.db.authSession.findFirst({
      where: {
        id: connection.authSessionId,
        userId: connection.userId,
        tokenId: connection.tokenId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    const job = await this.db.execution.findFirst({
      where: {
        id: connection.executionId,
        userId: connection.userId,
        workspace: { session: { id: connection.sessionId } },
      },
    });

    return !!session && !!job;
  }

  async connect(connectionId: string, ticket: string, origin: string) {
    if (
      origin !== (process.env.WEB_ORIGIN ?? 'http://localhost:3000') ||
      !/^[A-Za-z0-9_-]{43}$/.test(ticket)
    ) {
      throw new StudyError(403, 'Invalid stream handshake.');
    }

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
      throw new StudyError(403, 'Stream ticket expired or already used.');
    }

    const job = await this.db.execution.findUniqueOrThrow({
      where: { id: grant.execution_id },
      include: { workspace: { include: { session: true } } },
    });
    const connection: Connection = {
      connectionId,
      executionId: job.id,
      userId: job.userId,
      authSessionId: grant.auth_session_id,
      tokenId: grant.token_id,
      sessionId: job.workspace.session!.id,
      expires: String(Math.floor(Date.now() / 1000) + 900),
    };
    if (!(await this.authorized(connection))) {
      throw new StudyError(403, 'Stream session is no longer active.');
    }

    const item: Record<string, AttributeValue> = Object.fromEntries(
      Object.entries(connection).map(([key, value]) => [key, { S: value }]),
    );
    item.expires = { N: connection.expires };

    await this.dynamo.send(
      new PutItemCommand({
        TableName: this.table,
        Item: {
          ...item,
          pk: { S: `EXEC#${job.id}` },
          sk: { S: `CONN#${connectionId}` },
        },
      }),
    );
    await this.dynamo.send(
      new PutItemCommand({
        TableName: this.table,
        Item: {
          ...item,
          pk: { S: `CONN#${connectionId}` },
          sk: { S: 'META' },
        },
      }),
    );
  }

  private decode(item: Record<string, { S?: string; N?: string }>) {
    return Object.fromEntries(
      Object.entries(item).map(([key, value]) => [key, value.S ?? value.N]),
    ) as Connection;
  }

  async disconnect(connectionId: string) {
    const record = await this.dynamo.send(
      new GetItemCommand({
        TableName: this.table,
        Key: { pk: { S: `CONN#${connectionId}` }, sk: { S: 'META' } },
        ConsistentRead: true,
      }),
    );
    if (!record.Item) {
      return;
    }

    const connection = this.decode(record.Item);
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

  async resume(connectionId: string) {
    const record = await this.dynamo.send(
      new GetItemCommand({
        TableName: this.table,
        Key: { pk: { S: `CONN#${connectionId}` }, sk: { S: 'META' } },
        ConsistentRead: true,
      }),
    );
    if (!record.Item) {
      throw new StudyError(403, 'Unknown stream connection.');
    }

    await this.send(this.decode(record.Item));
  }

  private async send(connection: Connection) {
    if (!(await this.authorized(connection))) {
      await this.disconnect(connection.connectionId);

      return;
    }

    const job = await this.executions.owned(
      connection.userId,
      connection.executionId,
    );
    const client = new ApiGatewayManagementApiClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      endpoint: process.env.WEBSOCKET_MANAGEMENT_URL,
      maxAttempts: 3,
    });

    try {
      await client.send(
        new PostToConnectionCommand({
          ConnectionId: connection.connectionId,
          Data: Buffer.from(JSON.stringify(this.executions.snapshot(job))),
        }),
      );
    } catch (error) {
      if ((error as { name: string }).name === 'GoneException') {
        await this.disconnect(connection.connectionId);
      } else {
        // HTTP resume remains available if the delivery channel is temporarily unavailable.
        console.warn(
          JSON.stringify({
            metric: 'stream_delivery_failure',
            executionId: job.id,
          }),
        );
      }
    } finally {
      client.destroy();
    }
  }

  async broadcast(id: string) {
    if (!process.env.WEBSOCKET_MANAGEMENT_URL) {
      return;
    }

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
        await this.send(this.decode(item));
      }

      cursor = page.LastEvaluatedKey;
    } while (cursor);
  }
}
