import { randomUUID } from 'node:crypto';
import {
  defaultRoadmapDefinition,
  DEFAULT_ROADMAP_ID,
} from '../domain/default-roadmap.js';
import type { StudyRepository } from '../domain/ports/study-repository.js';
import type { Workspace } from '../domain/study.js';
import { StudyService } from './study.service.js';

describe('StudyService', () => {
  const id = randomUUID();

  const repo = {
    fixture: vi.fn<StudyRepository['fixture']>(),
    papertRoadmaps: vi.fn<StudyRepository['papertRoadmaps']>(),
    findMany: vi.fn<StudyRepository['findMany']>(),
    startedOf: vi.fn<StudyRepository['startedOf']>(),
    roadmaps: vi.fn<StudyRepository['roadmaps']>(),
    start: vi.fn<StudyRepository['start']>(),
    enroll: vi.fn<StudyRepository['enroll']>(),
    owns: vi.fn<StudyRepository['owns']>(),
    workspace: vi.fn<StudyRepository['workspace']>(),
    save: vi.fn<StudyRepository['save']>(),
    saveRevision: vi.fn<StudyRepository['saveRevision']>(),
    attempts: vi.fn<StudyRepository['attempts']>(),
    attempt: vi.fn<StudyRepository['attempt']>(),
    recordAttempt: vi.fn<StudyRepository['recordAttempt']>(),
  };

  let service: StudyService;
  let workspace: Workspace;

  beforeEach(() => {
    workspace = {
      id,
      roadmap: {
        id: DEFAULT_ROADMAP_ID,
        authorName: 'Papert',
        authorUserId: null,
        definition: defaultRoadmapDefinition,
      },
      currentStep: 0,
      revision: 0,
      files: defaultRoadmapDefinition.starterFiles,
      notes: '',
      session: { id: randomUUID(), lastOpenedAt: new Date() },
      attempts: [],
      solution: { analyzedAttempts: 0, required: 3, eligible: false },
    };

    vi.resetAllMocks();
    repo.fixture.mockResolvedValue(workspace.roadmap);
    repo.start.mockResolvedValue(workspace);
    repo.workspace.mockResolvedValue(workspace);
    repo.owns.mockResolvedValue(true);
    repo.save.mockResolvedValue(workspace);

    service = new StudyService(repo);
  });

  it('scopes every workspace lookup to the authenticated student', async () => {
    await service.workspace('student', id);

    expect(repo.workspace).toHaveBeenCalledWith('student', id, false);

    repo.workspace.mockResolvedValue(null);
    repo.owns.mockResolvedValue(false);

    await expect(service.workspace('other', id)).rejects.toMatchObject({
      kind: 'not_found',
    });

    await expect(
      service.save('other', id, { revision: 0, notes: '', files: {} }),
    ).rejects.toMatchObject({ kind: 'not_found' });

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('does not start locked steps or record an attempt for them', async () => {
    await expect(
      service.step('student', id, 'separate-rules'),
    ).rejects.toMatchObject({ kind: 'forbidden' });

    await expect(
      service.recordAttempt('student', id, {
        revision: 0,
        stepId: 'separate-rules',
      }),
    ).rejects.toMatchObject({ kind: 'forbidden' });

    expect(repo.recordAttempt).not.toHaveBeenCalled();

    expect(await service.step('student', id, 'validate-input')).toEqual(
      defaultRoadmapDefinition.steps[0],
    );
  });

  it('rejects forged start state and stale writes', async () => {
    await expect(
      service.start('student', DEFAULT_ROADMAP_ID, { currentStep: 1 }),
    ).rejects.toMatchObject({ kind: 'invalid' });

    expect(repo.start).not.toHaveBeenCalled();

    repo.save.mockResolvedValue(null);

    await expect(
      service.save('student', id, { revision: 0, notes: '', files: {} }),
    ).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('answers a summary save with the revision only and keeps the full default', async () => {
    const changes = { revision: 0, notes: '', files: {} };
    repo.saveRevision.mockResolvedValue({ id, revision: 1 });

    const summary = await service.save('student', id, changes, 'summary');
    const full = await service.save('student', id, changes);

    expect(summary).toEqual({ id, revision: 1 });
    expect(full).toBe(workspace);
    expect(repo.saveRevision).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledTimes(1);

    await expect(
      service.save('student', id, changes, 'everything'),
    ).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('pages attempts with a bounded limit and scopes them to the student', async () => {
    const page = { items: [], nextCursor: null };
    repo.attempts.mockResolvedValue(page);

    const result = await service.attempts('student', id, { limit: '5' });

    expect(result).toBe(page);
    expect(repo.attempts).toHaveBeenCalledWith('student', id, { limit: 5 });

    await expect(
      service.attempts('student', id, { limit: '500' }),
    ).rejects.toMatchObject({ kind: 'invalid' });

    repo.attempts.mockResolvedValue(null);

    await expect(service.attempts('other', id, {})).rejects.toMatchObject({
      kind: 'not_found',
    });
  });

  it('loads one attempt with its files only for its owner', async () => {
    const attemptId = randomUUID();
    repo.attempt.mockResolvedValue(null);

    await expect(service.attempt('other', id, attemptId)).rejects.toMatchObject(
      { kind: 'not_found' },
    );
    expect(repo.attempt).toHaveBeenCalledWith('other', id, attemptId);

    await expect(
      service.attempt('student', id, 'not-an-id'),
    ).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('orders the study home by latest activity, started roadmaps first', async () => {
    const roadmap = workspace.roadmap;
    const older = {
      roadmap,
      workspace: {
        id: 'older',
        currentStep: 0,
        lastActivityAt: new Date('2026-11-01T10:00:00Z'),
      },
    };
    const newer = {
      roadmap,
      workspace: {
        id: 'newer',
        currentStep: 1,
        lastActivityAt: new Date('2026-11-05T10:00:00Z'),
      },
    };
    const notStarted = { roadmap, workspace: null };
    repo.roadmaps.mockResolvedValue([notStarted, older, newer]);

    const ordered = await service.roadmaps('student');

    expect(ordered.map((entry) => entry.workspace?.id ?? null)).toEqual([
      'newer',
      'older',
      null,
    ]);
  });
  it('uses narrow ownership for summary saves without loading the workspace history', async () => {
    repo.saveRevision.mockResolvedValue({ id, revision: 1 });

    const saved = await service.save(
      'student',
      id,
      { revision: 0, notes: '', files: {} },
      'summary',
    );

    expect(saved).toEqual({ id, revision: 1 });
    expect(repo.owns).toHaveBeenCalledWith('student', id);
    expect(repo.workspace).not.toHaveBeenCalled();
  });
});
