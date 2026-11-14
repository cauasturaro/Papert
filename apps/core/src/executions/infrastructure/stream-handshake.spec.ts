import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExecutionStreamService } from '../application/execution-stream.service.js';
import { connectStream, issueStreamTicket } from './stream-handshake.js';
import { streamEndpoint } from './stream-composition.js';

const secret = 'a'.repeat(43);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Stream transport boundary', () => {
  it('validates production endpoints in composition', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WEBSOCKET_URL', 'ws://stream.example');

    expect(streamEndpoint).toThrow('WEBSOCKET_URL must use WSS in production.');

    vi.stubEnv('WEBSOCKET_URL', 'wss://stream.example');

    expect(streamEndpoint()).toBe('wss://stream.example');
  });

  it('builds the ticket URL and preserves disabled streaming', async () => {
    vi.stubEnv('WEBSOCKET_URL', 'wss://stream.example');
    const ticket = vi
      .spyOn(ExecutionStreamService.prototype, 'ticket')
      .mockResolvedValue({ ticket: secret });
    const stream = Object.create(
      ExecutionStreamService.prototype,
    ) as ExecutionStreamService;
    const principal = {
      user: { id: 'user' },
      session: { id: 'session', tokenId: 'token' },
    };

    const result = await issueStreamTicket(stream, principal, 'execution');

    expect(result).toEqual({ url: 'wss://stream.example?ticket=' + secret });
    expect(ticket).toHaveBeenCalledWith(principal, 'execution');

    ticket.mockResolvedValue({ ticket: null });

    await expect(
      issueStreamTicket(stream, principal, 'execution'),
    ).resolves.toEqual({ url: null });
  });

  it('rejects origin or ticket wire syntax before redemption', async () => {
    vi.stubEnv('WEB_ORIGIN', 'https://web.example');
    const connect = vi
      .spyOn(ExecutionStreamService.prototype, 'connect')
      .mockResolvedValue(undefined);
    const stream = Object.create(
      ExecutionStreamService.prototype,
    ) as ExecutionStreamService;

    await expect(
      connectStream(stream, 'connection', secret, 'https://other.example'),
    ).rejects.toThrow('Invalid stream handshake.');
    await expect(
      connectStream(stream, 'connection', 'bad', 'https://web.example'),
    ).rejects.toThrow('Invalid stream handshake.');

    expect(connect).not.toHaveBeenCalled();

    await connectStream(stream, 'connection', secret, 'https://web.example');

    expect(connect).toHaveBeenCalledWith('connection', secret);
  });
});
