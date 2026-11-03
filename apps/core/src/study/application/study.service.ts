import { z } from 'zod';
import {
  attemptSchema,
  parse,
  saveSchema,
  StudyError,
} from '../domain/study.js';
import type { StudyRepository } from '../domain/study.js';

export class StudyService {
  constructor(private readonly repo: StudyRepository) {}

  fixture() {
    return this.repo.fixture();
  }

  async start(userId: string, roadmapId: string, body: unknown) {
    parse(z.object({}).strict(), body);
    parse(z.string().regex(/^[a-z0-9-]{1,100}$/), roadmapId);

    const workspace = await this.repo.start(userId, roadmapId);
    if (!workspace) {
      throw new StudyError('not_found', 'Roadmap not found.');
    }

    return workspace;
  }

  async workspace(userId: string, id: string) {
    parse(z.string().uuid(), id);

    const workspace = await this.repo.workspace(userId, id);
    if (!workspace) {
      throw new StudyError('not_found', 'Workspace not found.');
    }

    return workspace;
  }

  async step(userId: string, id: string, stepId: string) {
    const workspace = await this.workspace(userId, id);

    const index = workspace.roadmap.definition.steps.findIndex(
      (step) => step.id === stepId,
    );

    if (index < 0) {
      throw new StudyError('not_found', 'Step not found.');
    }

    if (index > workspace.currentStep) {
      throw new StudyError('forbidden', 'This step is locked.');
    }

    return workspace.roadmap.definition.steps[index];
  }

  async save(userId: string, id: string, body: unknown) {
    const changes = parse(saveSchema, body);

    await this.workspace(userId, id);

    const saved = await this.repo.save(userId, id, changes);
    if (!saved) {
      throw new StudyError(
        'conflict',
        'The workspace changed. Reload before saving again.',
      );
    }

    return saved;
  }

  async recordAttempt(userId: string, id: string, body: unknown) {
    const { revision, stepId } = parse(attemptSchema, body);

    const workspace = await this.workspace(userId, id);

    const current = workspace.roadmap.definition.steps[workspace.currentStep];

    if (!current || stepId !== current.id) {
      throw new StudyError(
        'forbidden',
        'Only the current step accepts attempts.',
      );
    }

    return this.repo.recordAttempt(userId, id, revision, stepId);
  }
}
