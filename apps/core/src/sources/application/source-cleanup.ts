import type { SourceRepository } from '../domain/ports/source-repository.js';
import type { SourceStorage } from '../domain/ports/source-storage.js';
import { renditionPrefix } from '../domain/viewer.js';

export async function purgeSource(
  repo: SourceRepository,
  storage: SourceStorage,
  id: string,
  key: string,
) {
  try {
    await storage.deleteAllVersions(key);
    await storage.deleteAllVersionsUnder(renditionPrefix(id));
    await repo.markPurged(id);

    return true;
  } catch {
    console.warn(JSON.stringify({ metric: 'source_purge_failure', id }));

    return false;
  }
}
