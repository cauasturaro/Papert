import type { TutorSource } from '../tutor/tutor-context.js';

/** Ready sources of a workspace the user owns; provided by the sources module. */
export interface TutorSourceCatalog {
  ready(userId: string, workspaceId: string): Promise<TutorSource[]>;
}
