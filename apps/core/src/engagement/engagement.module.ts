import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaService } from '../common/infrastructure/database/prisma.service.js';
import { StudyService } from '../study/application/study.service.js';
import { StudyModule } from '../study/study.module.js';
import { EngagementService } from './application/engagement.service.js';
import { EngagementController } from './infrastructure/engagement.controller.js';
import { PrismaAnalysisActivity } from './infrastructure/prisma-analysis-activity.js';
import { PrismaEngagementRepository } from './infrastructure/prisma-engagement-repository.js';
import { StudyServiceRoadmaps } from './infrastructure/study-roadmaps.js';

@Module({
  imports: [AuthModule, StudyModule],
  controllers: [EngagementController],
  providers: [
    {
      provide: EngagementService,
      inject: [PrismaService, StudyService],
      useFactory: (db: PrismaService, study: StudyService) =>
        new EngagementService(
          new PrismaEngagementRepository(db),
          new StudyServiceRoadmaps(study),
          () => new Date(),
        ),
    },
    // Driven by executions inside its settlement transaction.
    {
      provide: PrismaAnalysisActivity,
      useFactory: () => new PrismaAnalysisActivity(),
    },
  ],
  exports: [EngagementService, PrismaAnalysisActivity],
})
export class EngagementModule {}
