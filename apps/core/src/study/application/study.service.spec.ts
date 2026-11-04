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
    roadmaps: vi.fn<StudyRepository['roadmaps']>(),
    start: vi.fn<StudyRepository['start']>(),
    workspace: vi.fn<StudyRepository['workspace']>(),
    save: vi.fn<StudyRepository['save']>(),
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
    };

    vi.resetAllMocks();
    repo.fixture.mockResolvedValue(workspace.roadmap);
    repo.start.mockResolvedValue(workspace);
    repo.workspace.mockResolvedValue(workspace);
    repo.save.mockResolvedValue(workspace);

    service = new StudyService(repo);
  });

  it('scopes every workspace lookup to the authenticated student', async () => {
    await service.workspace('student', id);

    expect(repo.workspace).toHaveBeenCalledWith('student', id);

    repo.workspace.mockResolvedValue(null);

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
});
