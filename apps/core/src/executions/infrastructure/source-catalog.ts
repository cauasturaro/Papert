import type { SourceService } from '../../sources/application/source.service.js';
import type { TutorSourceCatalog } from '../domain/ports/tutor-source-catalog.js';

/** Reads sources through the sources module's public service, never its tables. */
export class SourceServiceCatalog implements TutorSourceCatalog {
  constructor(private readonly sources: SourceService) {}

  ready(userId: string, workspaceId: string) {
    return this.sources.readyForTutor(userId, workspaceId);
  }
}
