import type { StudyService } from '../../study/application/study.service.js';
import type { StudiedRoadmaps } from '../domain/ports/studied-roadmaps.js';

/** Reads official progress through Study's public service, never its tables. */
export class StudyServiceRoadmaps implements StudiedRoadmaps {
  constructor(private readonly study: StudyService) {}

  async progressOf(userId: string) {
    const roadmaps = await this.study.roadmaps(userId);

    return roadmaps.flatMap(({ roadmap, workspace }) => {
      if (!workspace) {
        return [];
      }

      return [
        {
          roadmapId: roadmap.id,
          workspaceId: workspace.id,
          title: roadmap.definition.title,
          completedSteps: workspace.currentStep,
          totalSteps: roadmap.definition.steps.length,
        },
      ];
    });
  }
}
