import { describe, expect, it, vi } from 'vitest';
import { ExecutionStreamService } from './execution-stream.service.js';
import { StreamConnectionClosed } from '../domain/stream.js';
import type { ExecutionRecord } from '../domain/execution.js';
import type { StreamConnection, StreamSettings } from '../domain/stream.js';
import type { StreamConnections } from '../domain/ports/stream-connections.js';

const now = new Date('2026-11-03T10:00:00Z');
const secret = 'a'.repeat(43);
const principal = {
  user: { id: 'user' },
  session: { id: 'auth', tokenId: 'token' },
};
const grant = {
  executionId: 'execution',
  authSessionId: 'auth',
  tokenId: 'token',
};
const connection: StreamConnection = {
  ...grant,
  connectionId: 'connection',
  userId: 'user',
  sessionId: 'study',
  expires: now.getTime() / 1000 + 900,
};

function setup() {
  const executions = {
    owned: vi.fn().mockResolvedValue({ id: 'execution' } as ExecutionRecord),
    snapshot: vi
      .fn()
      .mockReturnValue({ id: 'execution', text: 'Saved', sequence: 3 }),
  };
  const tickets = {
    generate: vi.fn().mockReturnValue(secret),
    replace: vi.fn().mockResolvedValue(undefined),
    consume: vi.fn().mockResolvedValue(grant),
  };
  const authorization = {
    execution: vi.fn().mockResolvedValue({
      id: 'execution',
      userId: 'user',
      sessionId: 'study',
    }),
    liveSession: vi.fn().mockResolvedValue(true),
    ownsExecution: vi.fn().mockResolvedValue(true),
  };
  const connections = {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(connection),
    remove: vi.fn().mockResolvedValue(undefined),
    forExecution: vi
      .fn<StreamConnections['forExecution']>()
      .mockImplementation(async function* () {
        yield connection;
      }),
  };
  const sender = { send: vi.fn().mockResolvedValue(undefined), close: vi.fn() };
  const delivery = {
    enabled: vi.fn().mockReturnValue(true),
    open: vi.fn().mockReturnValue(sender),
  };
  const settings: StreamSettings = {
    enabled: true,
  };
  const service = new ExecutionStreamService(
    executions,
    tickets,
    authorization,
    connections,
    delivery,
    () => settings,
    () => now,
  );

  return {
    service,
    executions,
    tickets,
    authorization,
    connections,
    delivery,
    sender,
    settings,
  };
}

describe('ExecutionStreamService with fake ports', () => {
  it('checks ownership before issuing a single-use 60-second ticket', async () => {
    const { service, executions, tickets } = setup();

    const result = await service.ticket(principal, 'execution');

    expect(result).toEqual({ ticket: secret });
    expect(tickets.replace).toHaveBeenCalledWith(secret, grant, 60000);
    expect(executions.owned.mock.invocationCallOrder[0]).toBeLessThan(
      tickets.replace.mock.invocationCallOrder[0],
    );
  });

  it('checks ownership even when streaming is disabled', async () => {
    const { service, settings, executions, tickets } = setup();
    settings.enabled = false;

    await expect(service.ticket(principal, 'execution')).resolves.toEqual({
      ticket: null,
    });

    expect(executions.owned).toHaveBeenCalled();
    expect(tickets.replace).not.toHaveBeenCalled();
  });

  it('rejects a consumed ticket and registers only an authorized connection', async () => {
    const { service, tickets, connections } = setup();
    tickets.consume.mockResolvedValueOnce(null);

    await expect(service.connect('connection', secret)).rejects.toThrow(
      'already used',
    );

    expect(connections.put).not.toHaveBeenCalled();

    await service.connect('connection', secret);

    expect(connections.put).toHaveBeenCalledWith(connection);
  });

  it.each(['liveSession', 'ownsExecution'] as const)(
    'denies connection when %s fails',
    async (method) => {
      const { service, authorization, connections } = setup();
      authorization[method].mockResolvedValue(false);

      await expect(service.connect('connection', secret)).rejects.toThrow(
        'no longer active',
      );

      expect(connections.put).not.toHaveBeenCalled();
    },
  );

  it('reauthorizes every delivery and disconnects revoked or expired sessions', async () => {
    const { service, authorization, connections, sender } = setup();
    authorization.liveSession.mockResolvedValue(false);

    await service.resume('connection');

    expect(sender.send).not.toHaveBeenCalled();
    expect(connections.remove).toHaveBeenCalledWith(connection);

    connections.get.mockResolvedValue({
      ...connection,
      expires: now.getTime() / 1000,
    });
    authorization.liveSession.mockClear();

    await service.resume('connection');

    expect(authorization.liveSession).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('delivers persisted snapshots and removes gone connections', async () => {
    const { service, sender, connections } = setup();

    await service.broadcast('execution');

    expect(sender.send).toHaveBeenCalledWith(
      'connection',
      {
        id: 'execution',
        text: 'Saved',
        sequence: 3,
      },
      expect.any(AbortSignal),
    );

    sender.send.mockRejectedValue(new StreamConnectionClosed());

    await service.resume('connection');

    expect(connections.remove).toHaveBeenCalledWith(connection);
    expect(connections.remove.mock.invocationCallOrder[0]).toBeLessThan(
      sender.close.mock.invocationCallOrder.at(-1)!,
    );
  });

  it('keeps delivery failures optional and skips fanout when disabled', async () => {
    const { service, sender, delivery, connections } = setup();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sender.send.mockRejectedValue(new Error('offline'));

    try {
      await expect(service.resume('connection')).resolves.toBeUndefined();

      expect(warning).toHaveBeenCalledWith(
        JSON.stringify({
          metric: 'stream_delivery_failure',
          executionId: 'execution',
        }),
      );
      expect(connections.remove).not.toHaveBeenCalled();

      delivery.enabled.mockReturnValue(false);

      await service.broadcast('execution');

      expect(connections.forExecution).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  it('rejects unknown resume and makes disconnect idempotent', async () => {
    const { service, connections } = setup();
    connections.get.mockResolvedValue(null);

    await expect(service.resume('unknown')).rejects.toThrow(
      'Unknown stream connection.',
    );
    await service.disconnect('unknown');

    expect(connections.remove).not.toHaveBeenCalled();
  });
  it('bounds connection fanout and reads one snapshot while reauthorizing each recipient', async () => {
    const { service, connections, executions, authorization, sender } = setup();
    connections.forExecution.mockImplementation(async function* () {
      for (let index = 0; index < 100; index++) {
        yield { ...connection, connectionId: `connection-${index}` };
      }
    });

    await service.broadcast('execution');

    expect(sender.send).toHaveBeenCalledTimes(8);
    expect(executions.owned).toHaveBeenCalledTimes(1);
    expect(authorization.liveSession).toHaveBeenCalledTimes(8);
    expect(sender.close).toHaveBeenCalledOnce();
    await expect(service.connect('new', secret)).rejects.toThrow(
      'Too many streams',
    );
  });

  it('returns before a stuck delivery can delay result acknowledgement', async () => {
    vi.useFakeTimers();
    const { service, sender } = setup();
    sender.send.mockImplementation(() => new Promise(() => {}));

    try {
      const broadcast = service.broadcast('execution');
      await vi.advanceTimersByTimeAsync(2000);
      await broadcast;

      expect(sender.close).toHaveBeenCalledOnce();
      expect(sender.send.mock.calls[0][2].aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
