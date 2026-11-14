import { ExecutionError } from '../domain/execution.js';

const mocked = vi.hoisted(() => ({
  accept: vi.fn(),
  broadcast: vi.fn(),
}));

vi.mock('@nestjs/core', () => ({
  NestFactory: {
    createApplicationContext: async () => ({
      get: (token: { name: string }) =>
        token.name === 'ExecutionWorkerService'
          ? { accept: mocked.accept }
          : { broadcast: mocked.broadcast },
    }),
  },
}));
vi.mock('../../app.module.js', () => ({ AppModule: class {} }));

import { results } from './lambda-handlers.js';

it('reports sanitized poison and infrastructure failures with message correlation', async () => {
  const executionId = '5706a8d1-a66b-4abb-b069-3c71cb9ec3bb';
  mocked.accept.mockRejectedValueOnce(
    new ExecutionError('invalid', 'private learner text'),
  );
  mocked.accept.mockRejectedValueOnce(new Error('secret database details'));
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

  try {
    const result = await results({
      Records: [
        { messageId: 'json', body: '{invalid' },
        {
          messageId: 'poison',
          body: JSON.stringify({ executionId, text: 'private' }),
          attributes: { ApproximateReceiveCount: '3' },
        },
        { messageId: 'database', body: JSON.stringify({ executionId }) },
      ],
    });

    expect(result.batchItemFailures.map((item) => item.itemIdentifier)).toEqual(
      ['json', 'poison', 'database'],
    );
    const logs = warning.mock.calls.map(([entry]) => JSON.parse(entry));
    expect(logs[0]).toMatchObject({
      messageId: 'json',
      category: 'invalid_payload',
    });
    expect(logs[1]).toMatchObject({
      executionId,
      messageId: 'poison',
      receiveCount: '3',
      category: 'invalid_payload',
    });
    expect(logs[2]).toMatchObject({
      executionId,
      messageId: 'database',
      category: 'processing_failure',
    });
    expect(JSON.stringify(logs)).not.toMatch(/private|secret/);
  } finally {
    warning.mockRestore();
  }
});

it('keeps malformed messages and denied access at 403 without logging payloads', async () => {
  const { websocketFailure } = await import('./lambda-handlers.js');
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});

  try {
    const invalid = websocketFailure(new SyntaxError('private payload'));
    const denied = websocketFailure(
      new ExecutionError('forbidden', 'private ticket'),
    );

    expect(invalid.statusCode).toBe(403);
    expect(denied.statusCode).toBe(403);
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});

it('logs unexpected websocket failures without their details and returns 500', async () => {
  const { websocketFailure } = await import('./lambda-handlers.js');
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});

  try {
    const response = websocketFailure(new Error('private credentials'));

    expect(response.statusCode).toBe(500);
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({ metric: 'stream_request_failure' }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally {
    log.mockRestore();
  }
});
