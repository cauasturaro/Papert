import { describe, expect, it, vi } from 'vitest';
import { ExecutionService } from './execution.service.js';
import type {
  ExecutionRecord,
  ExecutionRepository,
} from '../domain/execution.js';
import type { Position } from '../../analysis/domain/syntax.js';

const execution: ExecutionRecord = {
  id: 'execution',
  workspaceId: 'workspace',
  input: { kind: 'chat', prompt: 'Help', secret: 'private' },
  status: 'queued',
  text: '',
  grounding: null,
  sequence: 0,
  attempts: 0,
  charged: 0,
  reserved: 3000,
  createdAt: new Date(0),
  deadline: new Date(900000),
  firstEventAt: null,
  finishedAt: null,
  publishedAt: null,
};
const KEPT = '11111111-1111-4111-8111-111111111111';
const DELETED = '22222222-2222-4222-8222-222222222222';
const EXECUTION_ID = '33333333-3333-4333-8333-333333333333';
const LEASE = '44444444-4444-4444-8444-444444444444';

const request = {
  requestKey: '4ca755d9-108c-497c-b9a0-1dab240cb901',
  kind: 'chat',
  revision: 1,
  prompt: 'Help',
};

function setup() {
  const repo = {
    quota: vi.fn<ExecutionRepository['quota']>(),
    create: vi.fn<ExecutionRepository['create']>().mockResolvedValue(execution),
    analysisFiles: vi
      .fn<ExecutionRepository['analysisFiles']>()
      .mockResolvedValue({ 'main.ts': 'const x = 1;' }),
    rejectSyntax: vi
      .fn<ExecutionRepository['rejectSyntax']>()
      .mockResolvedValue({
        id: 'attempt',
        revision: 1,
        stepId: 'step',
        result: {},
      }),
    owned: vi.fn<ExecutionRepository['owned']>().mockResolvedValue(execution),
    list: vi.fn<ExecutionRepository['list']>().mockResolvedValue([execution]),
    cancel: vi
      .fn<ExecutionRepository['cancel']>()
      .mockResolvedValue({ ...execution, status: 'cancelled' }),
    createGeneration: vi
      .fn<ExecutionRepository['createGeneration']>()
      .mockResolvedValue(execution),
    claim: vi.fn<ExecutionRepository['claim']>(),
    failed: vi.fn<ExecutionRepository['failed']>(),
    active: vi.fn<ExecutionRepository['active']>(),
    accept: vi.fn<ExecutionRepository['accept']>().mockResolvedValue(execution),
    markPublished: vi.fn<ExecutionRepository['markPublished']>(),
    pending: vi
      .fn<ExecutionRepository['pending']>()
      .mockResolvedValue([execution]),
    expire: vi.fn<ExecutionRepository['expire']>().mockResolvedValue(2),
    sourceScope: vi.fn<ExecutionRepository['sourceScope']>().mockResolvedValue({
      userId: 'user',
      workspaceId: 'workspace',
      sourceIds: [KEPT, DELETED],
    }),
  } satisfies ExecutionRepository;
  const queue = { publish: vi.fn().mockResolvedValue(undefined) };
  const syntax = {
    check: vi.fn<() => Promise<Position[]>>().mockResolvedValue([]),
  };
  const sources = { ready: vi.fn().mockResolvedValue([]) };
  const service = new ExecutionService(repo, queue, syntax, sources);

  return { service, repo, queue, syntax, sources };
}

describe('ExecutionService with fake ports', () => {
  it('validates before calling ports', async () => {
    const { service, repo, queue } = setup();

    await expect(service.submit('user', 'workspace', {})).rejects.toThrow(
      'Invalid study request.',
    );

    expect(repo.create).not.toHaveBeenCalled();
    expect(queue.publish).not.toHaveBeenCalled();
  });

  it('persists before publication, marks only success and excludes private input', async () => {
    const { service, repo, queue, sources } = setup();

    const result = await service.submit('user', 'workspace', request);

    expect(repo.create).toHaveBeenCalledWith('user', 'workspace', request, {
      sources: [],
      syntax: undefined,
    });
    expect(repo.create.mock.invocationCallOrder[0]).toBeLessThan(
      queue.publish.mock.invocationCallOrder[0],
    );
    expect(queue.publish.mock.invocationCallOrder[0]).toBeLessThan(
      repo.markPublished.mock.invocationCallOrder[0],
    );
    expect(result).toMatchObject({ id: execution.id, prompt: 'Help' });
    expect(result).not.toHaveProperty('input');
    expect(sources.ready).not.toHaveBeenCalled();
  });

  it('keeps durable admission when publication fails, then retries the outbox on sweep', async () => {
    const { service, repo, queue } = setup();
    queue.publish.mockRejectedValueOnce(new Error('offline'));

    const admitted = await service.submit('user', 'workspace', request);

    expect(admitted.id).toBe(execution.id);
    expect(repo.markPublished).not.toHaveBeenCalled();

    const swept = await service.sweep();

    expect(swept).toEqual({ expired: 2, published: 1 });
    expect(repo.markPublished).toHaveBeenCalledWith(execution.id);
  });

  it('loads source context only for tutor requests', async () => {
    const { service, sources, repo } = setup();
    const tutorRequest = { ...request, mode: 'doubt' };

    await service.submit('user', 'workspace', tutorRequest);

    expect(sources.ready).toHaveBeenCalledWith('user', 'workspace');
    expect(sources.ready.mock.invocationCallOrder[0]).toBeLessThan(
      repo.create.mock.invocationCallOrder[0],
    );
  });

  it('records syntax rejection without reserving or publishing', async () => {
    const { service, repo, syntax, queue, sources } = setup();
    syntax.check.mockResolvedValue([
      { line: 1, column: 1, message: 'Unexpected token' },
    ]);
    const analysis = {
      requestKey: request.requestKey,
      kind: 'analysis',
      revision: 1,
    };

    const result = await service.submit('user', 'workspace', analysis);

    expect(result).toMatchObject({
      status: 'syntax_error',
      syntax: { status: 'failed' },
    });
    expect(repo.rejectSyntax).toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
    expect(queue.publish).not.toHaveBeenCalled();
    expect(sources.ready).not.toHaveBeenCalled();
  });

  it('passes successful syntax coverage into admission and leaves stale revisions to idempotency', async () => {
    const { service, repo, syntax } = setup();
    const analysis = {
      requestKey: request.requestKey,
      kind: 'analysis',
      revision: 1,
    };

    await service.submit('user', 'workspace', analysis);

    expect(repo.create).toHaveBeenLastCalledWith(
      'user',
      'workspace',
      analysis,
      {
        sources: [],
        syntax: {
          status: 'passed',
          coverage: 'complete',
          checked: [{ path: 'main.ts', language: 'typescript' }],
          unchecked: [],
          diagnostics: [],
        },
      },
    );

    repo.analysisFiles.mockResolvedValue(null);
    syntax.check.mockClear();

    await service.submit('user', 'workspace', analysis);

    expect(syntax.check).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenLastCalledWith(
      'user',
      'workspace',
      analysis,
      { sources: [], syntax: undefined },
    );
  });

  it('does not republish an idempotent execution that was already published', async () => {
    const { service, repo, queue } = setup();
    repo.create.mockResolvedValue({ ...execution, publishedAt: new Date(0) });

    await service.submit('user', 'workspace', request);

    expect(queue.publish).not.toHaveBeenCalled();
  });

  it('lets Seymour search only admitted sources that are still ready', async () => {
    const { service, repo, sources } = setup();
    repo.active.mockResolvedValue(true);
    sources.ready.mockResolvedValue([
      { id: KEPT, filename: 'a.pdf', format: 'pdf' },
    ]);

    const live = await service.liveSources(EXECUTION_ID, LEASE);

    repo.active.mockResolvedValue(false);
    const stale = await service.liveSources(EXECUTION_ID, LEASE);

    expect(live).toEqual([KEPT]);
    expect(stale).toEqual([]);
    expect(sources.ready).toHaveBeenCalledWith('user', 'workspace');
  });

  it('re-authorizes citations before storing a completed answer', async () => {
    const { service, repo, sources } = setup();
    sources.ready.mockResolvedValue([
      { id: KEPT, filename: 'a.pdf', format: 'pdf' },
    ]);

    const citation = (sourceId: string) => ({
      sourceId,
      cite: 'a.pdf, p. 1',
      location: { page: 1 },
      excerpt: 'text',
      quote: null,
    });
    const event = {
      version: 1,
      executionId: EXECUTION_ID,
      lease: LEASE,
      index: 100,
      status: 'completed',
      text: 'Answer',
      tokens: 10,
      grounding: {
        support: 'cited',
        citations: [citation(DELETED), citation(KEPT)],
      },
    };
    const malformed = { ...event, grounding: { support: 'maybe' } };

    await service.accept(event);
    await service.accept(malformed);

    expect(repo.accept.mock.calls[0][1]).toEqual({
      support: 'cited',
      citations: [citation(KEPT)],
    });
    expect(repo.accept.mock.calls[1][1]).toBeNull();
  });
});
