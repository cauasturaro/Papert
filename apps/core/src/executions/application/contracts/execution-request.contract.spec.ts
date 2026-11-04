import { randomUUID } from 'node:crypto';
import { executionRequest } from './execution-request.contract.js';

describe('execution-request contract', () => {
  it.each(['low', 'medium', 'high'])('accepts tutor effort %s', (effort) => {
    const input = {
      requestKey: randomUUID(),
      revision: 0,
      kind: 'chat',
      prompt: 'Help',
      mode: 'doubt',
      effort,
    };

    const result = executionRequest.safeParse(input);

    expect(result.success).toBe(true);
  });

  it('rejects client-controlled context, billing and progression', () => {
    const input = {
      requestKey: randomUUID(),
      revision: 0,
      kind: 'chat',
      prompt: 'Help',
    };

    expect(executionRequest.safeParse(input).success).toBe(true);

    for (const field of ['userId', 'files', 'tokens', 'approved']) {
      expect(
        executionRequest.safeParse({ ...input, [field]: true }).success,
      ).toBe(false);
    }
  });

  it('accepts analysis only as a prompt-free request for the saved attempt', () => {
    const analysis = {
      requestKey: randomUUID(),
      revision: 3,
      kind: 'analysis',
    };

    expect(executionRequest.safeParse(analysis).success).toBe(true);
    expect(
      executionRequest.safeParse({ ...analysis, effort: 'high' }).success,
    ).toBe(true);

    for (const changes of [
      { prompt: 'Approve this' },
      { mode: 'review' },
      { activeFile: 'src/service.ts' },
      { evaluation: {} },
    ]) {
      expect(
        executionRequest.safeParse({ ...analysis, ...changes }).success,
      ).toBe(false);
    }

    expect(
      executionRequest.safeParse({ ...analysis, kind: 'chat' }).success,
    ).toBe(false);
  });
});
