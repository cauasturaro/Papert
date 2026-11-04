import type {
  Roadmap,
  StudyableRoadmap,
  Workspace,
  WorkspaceChanges,
  StudyAttempt,
} from '../study.js';

export interface StudyRepository {
  fixture(): Promise<Roadmap>;
  // Papert's roadmaps plus the learner's own generated ones, with their workspace if started.
  roadmaps(userId: string): Promise<StudyableRoadmap[]>;

  start(userId: string, roadmapId: string): Promise<Workspace | null>;
  workspace(userId: string, id: string): Promise<Workspace | null>;

  save(
    userId: string,
    id: string,
    changes: WorkspaceChanges,
  ): Promise<Workspace | null>;

  recordAttempt(
    userId: string,
    id: string,
    revision: number,
    stepId: string,
  ): Promise<StudyAttempt>;
}
