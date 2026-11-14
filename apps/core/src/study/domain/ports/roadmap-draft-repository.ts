import type { Level } from '../study.js';
import type { RoadmapDraft } from '../roadmap-draft.js';

// Each method locks the workspace row and applies the draft rules inside its transaction.
export interface RoadmapDraftRepository {
  create(
    userId: string,
    request: { goal: string; level: Level },
  ): Promise<RoadmapDraft>;
  list(userId: string): Promise<RoadmapDraft[]>;
  find(userId: string, workspaceId: string): Promise<RoadmapDraft | null>;
  // The draft that generated this roadmap, when the user generated it.
  byRoadmap(userId: string, roadmapId: string): Promise<RoadmapDraft | null>;
  declineRecommendation(
    userId: string,
    workspaceId: string,
  ): Promise<RoadmapDraft>;
  discard(userId: string, workspaceId: string): Promise<RoadmapDraft>;
}
