import type { CommunityRoadmap } from '../community.js';

/** What Community needs from Study; implemented over Study's public service. */
export interface CommunityRoadmaps {
  find(roadmapId: string): Promise<CommunityRoadmap | null>;
  findMany(roadmapIds: string[]): Promise<CommunityRoadmap[]>;

  // Papert's own roadmaps, created on first use.
  papert(): Promise<CommunityRoadmap[]>;

  // Creates or resumes the learner's own workspace; authorization is the caller's.
  enroll(userId: string, roadmapId: string): Promise<{ workspaceId: string }>;
  startedOf(userId: string, roadmapIds: string[]): Promise<Set<string>>;
}
