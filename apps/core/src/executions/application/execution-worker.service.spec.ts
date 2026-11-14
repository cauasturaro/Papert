import { describe, expect, it, vi } from 'vitest';
import { ExecutionWorkerService } from './execution-worker.service.js';
import type { ExecutionRecord } from '../domain/execution.js';
import type { TutorNoteCatalog } from '../domain/ports/tutor-note-catalog.js';
import type { ExecutionLifecycle } from '../domain/ports/execution-lifecycle.js';

const execution: ExecutionRecord = {
  id: 'execution',
  workspaceId: 'workspace',
  input: { kind: 'chat', prompt: 'Help' },
  status: 'completed',
  text: '',
  grounding: null,
  sequence: 1,
  attempts: 1,
  charged: 0,
  reserved: 0,
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

function setup() {
  const lifecycle = {
    cancel: vi.fn<ExecutionLifecycle['cancel']>(),
    claim: vi.fn<ExecutionLifecycle['claim']>(),
    failed: vi.fn<ExecutionLifecycle['failed']>(),
    active: vi.fn<ExecutionLifecycle['active']>(),
    accept: vi.fn<ExecutionLifecycle['accept']>().mockResolvedValue(execution),
    sourceScope: vi.fn<ExecutionLifecycle['sourceScope']>().mockResolvedValue({
      userId: 'user',
      workspaceId: 'workspace',
      sourceIds: [KEPT, DELETED],
      offeredRoadmapIds: ['kept-roadmap', 'unpublished-roadmap'],
    }),
    expire: vi.fn<ExecutionLifecycle['expire']>(),
  } satisfies ExecutionLifecycle;
  const sources = { ready: vi.fn().mockResolvedValue([]) };
  const catalog = {
    candidates: vi.fn().mockResolvedValue([]),
    publishedIds: vi.fn().mockResolvedValue(['kept-roadmap']),
  };
  const notes = {
    active: vi.fn<TutorNoteCatalog['active']>().mockResolvedValue([]),
  } satisfies TutorNoteCatalog;
  const service = new ExecutionWorkerService(
    lifecycle,
    sources,
    catalog,
    notes,
  );

  return { service, lifecycle, sources, catalog, notes };
}

describe('ExecutionWorkerService with fake ports', () => {
  it('lets Seymour search only admitted sources that are still ready', async () => {
    const { service, lifecycle, sources } = setup();
    lifecycle.active.mockResolvedValue(true);
    sources.ready.mockResolvedValue([
      { id: KEPT, filename: 'a.pdf', format: 'pdf' },
    ]);

    const live = await service.liveSources(EXECUTION_ID, LEASE);

    lifecycle.active.mockResolvedValue(false);
    const stale = await service.liveSources(EXECUTION_ID, LEASE);

    expect(live).toEqual([KEPT]);
    expect(stale).toEqual([]);
    expect(sources.ready).toHaveBeenCalledWith('user', 'workspace');
  });

  it('re-authorizes citations before storing a completed answer', async () => {
    const { service, lifecycle, sources } = setup();
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

    expect(lifecycle.accept.mock.calls[0][1]).toEqual({
      support: 'cited',
      citations: [citation(KEPT)],
    });
    expect(lifecycle.accept.mock.calls[1][1]).toBeNull();
  });
  it('passes only offered roadmaps that are still published to the draft', async () => {
    const { service, lifecycle, catalog } = setup();
    const event = {
      version: 1,
      executionId: EXECUTION_ID,
      lease: LEASE,
      index: 100,
      status: 'completed',
      text: '',
      tokens: 40,
      recommendation: { matches: [] },
    };

    await service.accept(event);

    expect(catalog.publishedIds).toHaveBeenCalledWith([
      'kept-roadmap',
      'unpublished-roadmap',
    ]);
    expect(lifecycle.accept.mock.calls[0][2]).toEqual({
      liveSourceIds: [],
      publishedIds: ['kept-roadmap'],
    });
  });

  it('gives a claiming worker only the durable notes that still exist', async () => {
    const { service, lifecycle, notes } = setup();
    lifecycle.claim.mockResolvedValue({
      status: 'running',
      lease: 'lease',
      budget: 8000,
      input: {
        kind: 'chat',
        mode: 'doubt',
        memory: [
          { id: 'kept', kind: 'preference', text: 'Short answers' },
          { id: 'deleted', kind: 'difficulty', text: 'Closures' },
        ],
      },
    });
    notes.active.mockResolvedValue(['kept']);

    const claim = await service.claim('execution');

    expect(notes.active).toHaveBeenCalledWith('user', ['kept', 'deleted']);
    expect(claim.input).toEqual({
      kind: 'chat',
      mode: 'doubt',
      memory: [{ id: 'kept', kind: 'preference', text: 'Short answers' }],
    });
  });

  it('leaves claims without notes untouched', async () => {
    const { service, lifecycle, notes } = setup();
    const claimed = {
      status: 'running',
      lease: 'lease',
      budget: 8000,
      input: { kind: 'analysis' },
    };
    lifecycle.claim.mockResolvedValue(claimed);

    const claim = await service.claim('execution');

    expect(claim).toBe(claimed);
    expect(notes.active).not.toHaveBeenCalled();
  });
});
