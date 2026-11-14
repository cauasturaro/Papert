import type { SourceService } from '../../sources/application/source.service.js';
import type { RoadmapDraftService } from '../../study/application/roadmap-draft.service.js';
import type { PrivateReferences } from '../domain/ports/private-references.js';

/**
 * Filenames of the sources behind a generated roadmap: those Seymour consulted and those
 * still in the roadmap's workspace. Read through Study's and Sources' public services.
 */
export class SourceReferences implements PrivateReferences {
  constructor(
    private readonly drafts: RoadmapDraftService,
    private readonly sources: SourceService,
  ) {}

  async filenames(userId: string, roadmapId: string) {
    const origin = await this.drafts.origin(userId, roadmapId);
    if (!origin) {
      return [];
    }

    const current = await this.sources.list(userId, origin.workspaceId);

    const names = current.map((source) => source.filename);

    return [...new Set([...origin.consulted, ...names])];
  }
}
