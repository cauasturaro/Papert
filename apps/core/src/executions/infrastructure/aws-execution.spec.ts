import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiGatewayStreamDelivery,
  DynamoStreamConnections,
} from './aws-execution.js';
import { StreamConnectionClosed } from '../domain/stream.js';
import type { StreamConnection } from '../domain/stream.js';

const sdk = vi.hoisted(() => ({
  deliver: vi.fn(),
  destroy: vi.fn(),
  dynamo: vi.fn(),
}));

vi.mock('@aws-sdk/client-apigatewaymanagementapi', async (original) => {
  const actual =
    await original<typeof import('@aws-sdk/client-apigatewaymanagementapi')>();

  return {
    ...actual,
    ApiGatewayManagementApiClient: class {
      send = sdk.deliver;
      destroy = sdk.destroy;
    },
  };
});

vi.mock('@aws-sdk/client-dynamodb', async (original) => {
  const actual = await original<typeof import('@aws-sdk/client-dynamodb')>();

  return {
    ...actual,
    DynamoDBClient: class {
      send = sdk.dynamo;
    },
  };
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('Stream AWS adapters', () => {
  it('translates gone connections while preserving other delivery errors', async () => {
    const delivery = new ApiGatewayStreamDelivery().open();
    const gone = new Error('Gone');
    gone.name = 'GoneException';
    sdk.deliver.mockRejectedValueOnce(gone);

    await expect(delivery.send('connection', {})).rejects.toBeInstanceOf(
      StreamConnectionClosed,
    );

    const unavailable = new Error('Unavailable');
    sdk.deliver.mockRejectedValueOnce(unavailable);

    await expect(delivery.send('connection', {})).rejects.toBe(unavailable);

    delivery.close();

    expect(sdk.destroy).toHaveBeenCalledOnce();
  });

  it('stores epoch seconds as DynamoDB numbers and reads semantic numeric expiry', async () => {
    const connection: StreamConnection = {
      connectionId: 'connection',
      executionId: 'execution',
      userId: 'user',
      authSessionId: 'auth',
      tokenId: 'token',
      sessionId: 'study',
      expires: 1793700900,
    };
    const connections = new DynamoStreamConnections();
    sdk.dynamo.mockResolvedValue({});

    await connections.put(connection);

    const item = sdk.dynamo.mock.calls[0][0].input.Item;
    expect(item.expires).toEqual({ N: '1793700900' });
    expect(sdk.dynamo).toHaveBeenCalledTimes(2);

    sdk.dynamo.mockResolvedValueOnce({ Item: item });

    const restored = await connections.get('connection');

    expect(restored).toMatchObject(connection);
    expect(typeof restored?.expires).toBe('number');
  });
});
