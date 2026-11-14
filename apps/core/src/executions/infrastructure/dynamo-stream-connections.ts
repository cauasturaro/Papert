import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import type { StreamConnections } from '../domain/ports/stream-connections.js';
import type { StreamConnection } from '../domain/stream.js';
import { awsOptions } from './aws-client-options.js';

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
          Limit: 8,
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
