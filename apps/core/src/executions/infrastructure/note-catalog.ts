import type { MemoryService } from '../../memory/application/memory.service.js';
import type { TutorNoteCatalog } from '../domain/ports/tutor-note-catalog.js';

/** Reads durable notes through the memory module's public service, never its tables. */
export class MemoryServiceNotes implements TutorNoteCatalog {
  constructor(private readonly memory: MemoryService) {}

  active(userId: string, ids: string[]) {
    return this.memory.activeIds(userId, ids);
  }
}
