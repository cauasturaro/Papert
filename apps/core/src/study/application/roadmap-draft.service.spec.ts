import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftSources } from '../domain/ports/draft-sources.js';
import type { RoadmapDraftRepository } from '../domain/ports/roadmap-draft-repository.js';
import type { RoadmapDraft } from '../domain/roadmap-draft.js';
import { StudyError } from '../domain/study.js';
import { RoadmapDraftService } from './roadmap-draft.service.js';

describe('RoadmapDraftService', () => {
  const drafts = {
    create: vi.fn<RoadmapDraftRepository['create']>(),
    list: vi.fn<RoadmapDraftRepository['list']>(),
    find: vi.fn<RoadmapDraftRepository['find']>(),
    discard: vi.fn<RoadmapDraftRepository['discard']>(),
  };
  const sources = {
    removeAll: vi.fn<DraftSources['removeAll']>(),
  };

  let service: RoadmapDraftService;
  let draft: RoadmapDraft;

  beforeEach(() => {
    draft = {
      workspaceId: 'workspace-1',
      goal: 'Learn TypeScript generics',
      level: 'beginner',
      status: 'open',
      executionId: null,
      outcome: null,
      roadmap: null,
      createdAt: new Date('2026-11-01T10:00:00Z'),
      updatedAt: new Date('2026-11-01T10:00:00Z'),
    };

    vi.resetAllMocks();
    drafts.create.mockResolvedValue(draft);
    drafts.list.mockResolvedValue([draft]);
    drafts.find.mockResolvedValue(draft);
    drafts.discard.mockResolvedValue({ ...draft, status: 'discarded' });
    sources.removeAll.mockResolvedValue();

    service = new RoadmapDraftService(drafts, sources);
  });

  it('creates a draft from the trimmed request and presents it', async () => {
    const body = { goal: '  Learn TypeScript generics  ', level: 'beginner' };

    const view = await service.create('student', body);

    expect(drafts.create).toHaveBeenCalledWith('student', {
      goal: 'Learn TypeScript generics',
      level: 'beginner',
    });
    expect(view).toMatchObject({
      workspaceId: 'workspace-1',
      status: 'open',
      failure: null,
    });
    expect(view).not.toHaveProperty('outcome');
  });

  it('rejects an invalid draft request before touching the repository', async () => {
    const shortGoal = { goal: 'Learn', level: 'beginner' };

    const creating = service.create('student', shortGoal);

    await expect(creating).rejects.toBeInstanceOf(StudyError);
    await expect(creating).rejects.toMatchObject({ kind: 'invalid' });
    expect(drafts.create).not.toHaveBeenCalled();
  });

  it('lists only the student drafts, presented', async () => {
    const views = await service.list('student');

    expect(drafts.list).toHaveBeenCalledWith('student');
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ workspaceId: 'workspace-1' });
  });

  it('scopes lookups to the student and hides missing or discarded drafts', async () => {
    const found = await service.find('student', 'workspace-1');

    expect(drafts.find).toHaveBeenCalledWith('student', 'workspace-1');
    expect(found.goal).toBe('Learn TypeScript generics');

    drafts.find.mockResolvedValue(null);

    await expect(service.find('other', 'workspace-1')).rejects.toMatchObject({
      kind: 'not_found',
    });

    drafts.find.mockResolvedValue({ ...draft, status: 'discarded' });

    await expect(service.find('student', 'workspace-1')).rejects.toMatchObject({
      kind: 'not_found',
    });
  });

  it('removes the sources only after the discard is committed', async () => {
    const calls: string[] = [];
    drafts.discard.mockImplementation(async () => {
      calls.push('discard');

      return { ...draft, status: 'discarded' };
    });
    sources.removeAll.mockImplementation(async () => {
      calls.push('removeAll');
    });

    const view = await service.discard('student', 'workspace-1', {});

    expect(calls).toEqual(['discard', 'removeAll']);
    expect(drafts.discard).toHaveBeenCalledWith('student', 'workspace-1');
    expect(sources.removeAll).toHaveBeenCalledWith('student', 'workspace-1');
    expect(view.status).toBe('discarded');
  });

  it('keeps the sources when the discard is refused or the body is not empty', async () => {
    drafts.discard.mockRejectedValue(
      new StudyError('conflict', 'A generated roadmap cannot be discarded.'),
    );

    await expect(
      service.discard('student', 'workspace-1', {}),
    ).rejects.toMatchObject({ kind: 'conflict' });

    await expect(
      service.discard('student', 'workspace-1', { force: true }),
    ).rejects.toMatchObject({ kind: 'invalid' });

    expect(drafts.discard).toHaveBeenCalledTimes(1);
    expect(sources.removeAll).not.toHaveBeenCalled();
  });
});
