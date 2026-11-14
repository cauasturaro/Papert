import { executionRecord, executionSnapshot } from './execution-snapshot.js';
import { executionView } from '../application/execution-presentation.js';
import type { ExecutionRecord } from '../domain/execution.js';

it.each(['chat', 'analysis', 'generation', 'recommendation'])(
  'retains %s snapshot context at the storage boundary',
  (kind) => {
    const stored = {
      kind,
      sessionId: 'session',
      files: { 'main.ts': 'private' },
      legacyField: true,
    };

    const snapshot = executionSnapshot(stored);

    expect(snapshot).toEqual(stored);
  },
);

it('keeps legacy presentation defaults without rewriting stored JSON', () => {
  const stored = { id: 'job', workspaceId: 'workspace', input: {} };
  const record = executionRecord(stored) as ExecutionRecord;

  const view = executionView(record);

  expect(view).toMatchObject({
    kind: 'chat',
    mode: null,
    effort: null,
    memoryUsed: 0,
    attemptId: null,
  });
  expect(view).not.toHaveProperty('input');
  expect(stored.input).toEqual({});
});

it.each([null, [], 1, 'invalid'])(
  'normalizes non-object legacy input: %j',
  (input) => {
    const snapshot = executionSnapshot(input);

    expect(snapshot).toEqual({});
  },
);
