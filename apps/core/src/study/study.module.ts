import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaService } from '../common/infrastructure/database/prisma.service.js';
import { RoadmapDraftService } from './application/roadmap-draft.service.js';
import { StudyService } from './application/study.service.js';
import { DraftController } from './infrastructure/draft.controller.js';
import { PrismaAttemptProgression } from './infrastructure/prisma-attempt-progression.js';
import { PrismaRoadmapDrafts } from './infrastructure/prisma-roadmap-drafts.js';
import { PrismaRoadmapGeneration } from './infrastructure/prisma-roadmap-generation.js';
import { PrismaRoadmapRecommendation } from './infrastructure/prisma-roadmap-recommendation.js';
import { PrismaStudyRepository } from './infrastructure/prisma-study-repository.js';
import { PrismaWorkspaceAccess } from './infrastructure/prisma-workspace-access.js';
import { StudyController } from './infrastructure/study.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [StudyController, DraftController],
  providers: [
    {
      provide: StudyService,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => {
        const repository = new PrismaStudyRepository(db);

        return new StudyService(repository);
      },
    },
    {
      provide: RoadmapDraftService,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => {
        const drafts = new PrismaRoadmapDrafts(db);

        return new RoadmapDraftService(drafts);
      },
    },
    // Driven by executions inside its own transactions.
    {
      provide: PrismaWorkspaceAccess,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => new PrismaWorkspaceAccess(db),
    },
    PrismaAttemptProgression,
    PrismaRoadmapGeneration,
    PrismaRoadmapRecommendation,
  ],
  exports: [
    StudyService,
    RoadmapDraftService,
    PrismaWorkspaceAccess,
    PrismaAttemptProgression,
    PrismaRoadmapGeneration,
    PrismaRoadmapRecommendation,
  ],
})
export class StudyModule {}
