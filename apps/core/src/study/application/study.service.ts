import { accessibleStep } from '../domain/step-access.js';
import { assertAttemptEligible } from '../domain/attempt-eligibility.js';
import { z } from 'zod';
import {
  attemptPageSchema,
  DEFAULT_ATTEMPT_PAGE,
  attemptSchema,
  parse,
  saveResponseSchema,
  saveSchema,
} from './contracts/study.contract.js';
import { byLastActivity, StudyError } from '../domain/study.js';
import type { StudyRepository } from '../domain/ports/study-repository.js';

export class StudyService {
  constructor(private readonly repo: StudyRepository) {}

  fixture() {
    return this.repo.fixture();
  }

  async roadmaps(userId: string) {
    const roadmaps = await this.repo.roadmaps(userId);

    return byLastActivity(roadmaps);
  }

  papertRoadmaps() {
    return this.repo.papertRoadmaps();
  }

  /** No authorization: callers expose only roadmaps they authorized, such as published ones. */
  definitionsOf(ids: string[]) {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }

    return this.repo.findMany(ids);
  }

  startedOf(userId: string, roadmapIds: string[]) {
    if (roadmapIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.repo.startedOf(userId, roadmapIds);
  }

  /** No authorization: for modules that authorized the roadmap themselves, such as the community. */
  async enrollAuthorized(userId: string, roadmapId: string) {
    const workspace = await this.repo.enroll(userId, roadmapId);
    if (!workspace) {
      throw new StudyError('not_found', 'Roadmap not found.');
    }

    return workspace;
  }

  async start(userId: string, roadmapId: string, body: unknown) {
    parse(z.strictObject({}), body);
    parse(z.string().regex(/^[a-z0-9-]{1,100}$/), roadmapId);

    const workspace = await this.repo.start(userId, roadmapId);
    if (!workspace) {
      throw new StudyError('not_found', 'Roadmap not found.');
    }

    return workspace;
  }

  async workspace(userId: string, id: string, attempts?: unknown) {
    parse(z.guid(), id);

    const recent = parse(z.enum(['recent']).optional(), attempts) === 'recent';
    const workspace = await this.repo.workspace(userId, id, recent);
    if (!workspace) {
      throw new StudyError('not_found', 'Workspace not found.');
    }

    return workspace;
  }

  async step(userId: string, id: string, stepId: string) {
    const workspace = await this.workspace(userId, id);

    return accessibleStep(
      workspace.roadmap.definition.steps,
      workspace.currentStep,
      stepId,
    );
  }

  /** `response=summary` answers with the new revision only; the default is the full workspace. */
  async save(userId: string, id: string, body: unknown, response?: unknown) {
    const changes = parse(saveSchema, body);
    const view = parse(saveResponseSchema, response);

    parse(z.guid(), id);
    if (!(await this.repo.owns(userId, id))) {
      throw new StudyError('not_found', 'Workspace not found.');
    }

    const saved =
      view === 'summary'
        ? await this.repo.saveRevision(userId, id, changes)
        : await this.repo.save(userId, id, changes);
    if (!saved) {
      throw new StudyError(
        'conflict',
        'The workspace changed. Reload before saving again.',
      );
    }

    return saved;
  }

  async attempts(userId: string, id: string, query: unknown) {
    parse(z.guid(), id);
    const requested = parse(attemptPageSchema, query);
    const page = {
      ...requested,
      limit: requested.limit ?? DEFAULT_ATTEMPT_PAGE,
    };

    const attempts = await this.repo.attempts(userId, id, page);
    if (!attempts) {
      throw new StudyError('not_found', 'Workspace not found.');
    }

    return attempts;
  }

  async attempt(userId: string, id: string, attemptId: string) {
    parse(z.guid(), id);
    parse(z.guid(), attemptId);

    const attempt = await this.repo.attempt(userId, id, attemptId);
    if (!attempt) {
      throw new StudyError('not_found', 'Attempt not found.');
    }

    return attempt;
  }

  async recordAttempt(userId: string, id: string, body: unknown) {
    const { revision, stepId } = parse(attemptSchema, body);

    const workspace = await this.workspace(userId, id);

    const current = workspace.roadmap.definition.steps[workspace.currentStep];

    assertAttemptEligible(current, stepId);

    return this.repo.recordAttempt(userId, id, revision, stepId);
  }
}
