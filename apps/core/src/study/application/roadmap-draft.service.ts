import {
  createDraftSchema,
  emptyBodySchema,
} from './contracts/draft.contract.js';
import { draftView } from './draft-presentation.js';
import type { DraftSources } from '../domain/ports/draft-sources.js';
import type { RoadmapDraftRepository } from '../domain/ports/roadmap-draft-repository.js';
import { parse } from './contracts/study.contract.js';
import { StudyError } from '../domain/study.js';

/** Preparation workspaces: created before uploads, bound to the roadmap they generate. */
export class RoadmapDraftService {
  constructor(
    private readonly drafts: RoadmapDraftRepository,
    private readonly sources: DraftSources,
  ) {}

  async create(userId: string, body: unknown) {
    const request = parse(createDraftSchema, body);

    const draft = await this.drafts.create(userId, request);

    return draftView(draft);
  }

  async list(userId: string) {
    const drafts = await this.drafts.list(userId);

    return drafts.map(draftView);
  }

  async find(userId: string, workspaceId: string) {
    const draft = await this.drafts.find(userId, workspaceId);
    if (!draft || draft.status === 'discarded') {
      throw new StudyError('not_found', 'Roadmap draft not found.');
    }

    return draftView(draft);
  }

  async discard(userId: string, workspaceId: string, body: unknown) {
    parse(emptyBodySchema, body);

    const draft = await this.drafts.discard(userId, workspaceId);

    // Discarding is committed first, so no new generation or upload can start meanwhile.
    await this.sources.removeAll(userId, workspaceId);

    return draftView(draft);
  }
}
