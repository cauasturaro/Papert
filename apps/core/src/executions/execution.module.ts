import { Module } from '@nestjs/common';
import { ParserSyntaxChecker } from '../analysis/infrastructure/parser-syntax-checker.js';
import { AuthModule } from '../auth/auth.module.js';
import { CommunityService } from '../community/application/community.service.js';
import { CommunityModule } from '../community/community.module.js';
import { EngagementModule } from '../engagement/engagement.module.js';
import { PrismaAnalysisActivity } from '../engagement/infrastructure/prisma-analysis-activity.js';
import { PrismaService } from '../common/infrastructure/database/prisma.service.js';
import { MemoryModule } from '../memory/memory.module.js';
import { MemoryService } from '../memory/application/memory.service.js';
import { PrismaTutorMemory } from '../memory/infrastructure/prisma-tutor-memory.js';
import { SourceService } from '../sources/application/source.service.js';
import { SourceModule } from '../sources/source.module.js';
import { PrismaAttemptProgression } from '../study/infrastructure/prisma-attempt-progression.js';
import { PrismaRoadmapGeneration } from '../study/infrastructure/prisma-roadmap-generation.js';
import { PrismaRoadmapRecommendation } from '../study/infrastructure/prisma-roadmap-recommendation.js';
import { PrismaWorkspaceAccess } from '../study/infrastructure/prisma-workspace-access.js';
import { StudyModule } from '../study/study.module.js';
import { ExecutionService } from './application/execution.service.js';
import { ExecutionStreamService } from './application/execution-stream.service.js';
import { ExecutionWorkerService } from './application/execution-worker.service.js';
import type { ExecutionRecommendationDrafts } from './domain/ports/execution-recommendation-drafts.js';
import type { ExecutionRoadmapDrafts } from './domain/ports/execution-roadmap-drafts.js';
import type { ExecutionStudyProgression } from './domain/ports/execution-study-progression.js';
import type { ExecutionWorkspaces } from './domain/ports/execution-workspaces.js';
import type { ExecutionMemory } from './domain/ports/execution-memory.js';
import type { ExecutionEngagement } from './domain/ports/execution-engagement.js';
import { SqsExecutionQueue } from './infrastructure/sqs-execution-queue.js';
import { CommunityRecommendationCatalog } from './infrastructure/community-catalog.js';
import { ExecutionController } from './infrastructure/execution.controller.js';
import { PrismaExecutionLifecycle } from './infrastructure/prisma-execution-lifecycle.js';
import { PrismaExecutionRepository } from './infrastructure/prisma-execution-repository.js';
import { MemoryServiceNotes } from './infrastructure/note-catalog.js';
import { SourceServiceCatalog } from './infrastructure/source-catalog.js';
import { createExecutionStream } from './infrastructure/stream-composition.js';

// Study builds these adapters; executions only passes its transaction to them.
const STUDY_PARTICIPANTS = [
  PrismaAttemptProgression,
  PrismaRoadmapGeneration,
  PrismaRoadmapRecommendation,
];

@Module({
  imports: [
    AuthModule,
    SourceModule,
    StudyModule,
    CommunityModule,
    MemoryModule,
    EngagementModule,
  ],
  controllers: [ExecutionController],
  providers: [
    {
      provide: PrismaExecutionLifecycle,
      inject: [
        PrismaService,
        ...STUDY_PARTICIPANTS,
        PrismaTutorMemory,
        PrismaAnalysisActivity,
      ],
      useFactory: (
        db: PrismaService,
        study: ExecutionStudyProgression,
        drafts: ExecutionRoadmapDrafts,
        recommendations: ExecutionRecommendationDrafts,
        memory: ExecutionMemory,
        engagement: ExecutionEngagement,
      ) =>
        new PrismaExecutionLifecycle(
          db,
          undefined,
          study,
          drafts,
          recommendations,
          memory,
          engagement,
        ),
    },
    {
      provide: PrismaExecutionRepository,
      inject: [
        PrismaService,
        PrismaWorkspaceAccess,
        ...STUDY_PARTICIPANTS,
        PrismaTutorMemory,
      ],
      useFactory: (
        db: PrismaService,
        workspaces: ExecutionWorkspaces,
        study: ExecutionStudyProgression,
        drafts: ExecutionRoadmapDrafts,
        recommendations: ExecutionRecommendationDrafts,
        memory: ExecutionMemory,
      ) =>
        new PrismaExecutionRepository(
          db,
          undefined,
          workspaces,
          study,
          drafts,
          recommendations,
          memory,
        ),
    },
    {
      provide: ExecutionService,
      inject: [
        PrismaExecutionRepository,
        PrismaExecutionLifecycle,
        SourceService,
        CommunityService,
      ],
      useFactory: (
        repository: PrismaExecutionRepository,
        lifecycle: PrismaExecutionLifecycle,
        sources: SourceService,
        community: CommunityService,
      ) =>
        new ExecutionService(
          repository,
          lifecycle,
          new SqsExecutionQueue(),
          new ParserSyntaxChecker(),
          new SourceServiceCatalog(sources),
          new CommunityRecommendationCatalog(community),
        ),
    },
    {
      provide: ExecutionWorkerService,
      inject: [
        PrismaExecutionLifecycle,
        SourceService,
        CommunityService,
        MemoryService,
      ],
      useFactory: (
        lifecycle: PrismaExecutionLifecycle,
        sources: SourceService,
        community: CommunityService,
        memory: MemoryService,
      ) =>
        new ExecutionWorkerService(
          lifecycle,
          new SourceServiceCatalog(sources),
          new CommunityRecommendationCatalog(community),
          new MemoryServiceNotes(memory),
        ),
    },
    {
      provide: ExecutionStreamService,
      inject: [PrismaService, ExecutionService],
      useFactory: (db: PrismaService, executions: ExecutionService) =>
        createExecutionStream(db, executions),
    },
  ],
  exports: [ExecutionService, ExecutionWorkerService, ExecutionStreamService],
})
export class ExecutionModule {}
