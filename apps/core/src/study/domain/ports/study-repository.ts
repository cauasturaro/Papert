import type {
  Roadmap,
  StudyableRoadmap,
  Workspace,
  WorkspaceChanges,
  StudyAttempt,
  AttemptPage,
  SavedRevision,
} from '../study.js';

export interface StudyRepository {
  fixture(): Promise<Roadmap>;
  // Papert's own roadmaps, inserted once.
  papertRoadmaps(): Promise<Roadmap[]>;
  findMany(ids: string[]): Promise<Roadmap[]>;
  // Roadmap IDs among the given ones the learner has a workspace for.
  startedOf(userId: string, roadmapIds: string[]): Promise<string[]>;

  // The learner's own generated roadmaps and those they started, with their workspace.
  roadmaps(userId: string): Promise<StudyableRoadmap[]>;

  // Papert's, the learner's own, or one they already study.
  start(userId: string, roadmapId: string): Promise<Workspace | null>;
  // Any existing roadmap; the caller has authorized it.
  enroll(userId: string, roadmapId: string): Promise<Workspace | null>;
  owns(userId: string, id: string): Promise<boolean>;
  workspace(
    userId: string,
    id: string,
    recentAttempts?: boolean,
  ): Promise<Workspace | null>;

  save(
    userId: string,
    id: string,
    changes: WorkspaceChanges,
  ): Promise<Workspace | null>;

  // Same write as `save`, answering only with the new revision.
  saveRevision(
    userId: string,
    id: string,
    changes: WorkspaceChanges,
  ): Promise<SavedRevision | null>;

  // Newest first, without file contents; null when the workspace is not the learner's.
  attempts(
    userId: string,
    id: string,
    page: { cursor?: string; limit: number; stepId?: string },
  ): Promise<AttemptPage | null>;
  attempt(
    userId: string,
    id: string,
    attemptId: string,
  ): Promise<StudyAttempt | null>;

  recordAttempt(
    userId: string,
    id: string,
    revision: number,
    stepId: string,
  ): Promise<StudyAttempt>;
}
