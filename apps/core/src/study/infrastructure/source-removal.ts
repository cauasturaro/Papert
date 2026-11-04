import type { SourceService } from '../../sources/application/source.service.js';
import type { DraftSources } from '../domain/draft-ports.js';

/** Deletes through the sources module's public service, so originals and vectors are purged. */
export class SourceServiceRemoval implements DraftSources {
  constructor(private readonly sources: SourceService) {}

  async removeAll(userId: string, workspaceId: string) {
    const listed = await this.sources.list(userId, workspaceId);

    for (const source of listed) {
      await this.sources.remove(userId, workspaceId, source.id);
    }
  }
}
