import type { StudyService } from '../../study/application/study.service.js';
import type { CommunityRoadmaps } from '../domain/ports/community-roadmaps.js';

/** Reads roadmaps and provisions workspaces through Study's public service, never its tables. */
export class StudyCommunityRoadmaps implements CommunityRoadmaps {
  constructor(private readonly study: StudyService) {}

  async find(roadmapId: string) {
    const [roadmap] = await this.study.definitionsOf([roadmapId]);

    return roadmap ?? null;
  }

  findMany(roadmapIds: string[]) {
    return this.study.definitionsOf(roadmapIds);
  }

  papert() {
    return this.study.papertRoadmaps();
  }

  async enroll(userId: string, roadmapId: string) {
    const workspace = await this.study.enrollAuthorized(userId, roadmapId);

    return { workspaceId: workspace.id };
  }

  async startedOf(userId: string, roadmapIds: string[]) {
    const started = await this.study.startedOf(userId, roadmapIds);

    return new Set(started);
  }
}
