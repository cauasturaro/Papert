import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { SourceService } from '../sources/application/source.service.js';
import { SourceModule } from '../sources/source.module.js';
import { RoadmapDraftService } from './application/roadmap-draft.service.js';
import { StudyService } from './application/study.service.js';
import { DraftController } from './infrastructure/draft.controller.js';
import { PrismaRoadmapDrafts } from './infrastructure/prisma-roadmap-drafts.js';
import { PrismaStudyRepository } from './infrastructure/prisma-study.repository.js';
import { SourceServiceRemoval } from './infrastructure/source-removal.js';
import { StudyController } from './infrastructure/study.controller.js';

@Module({
  imports: [AuthModule, SourceModule],
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
      inject: [PrismaService, SourceService],
      useFactory: (db: PrismaService, sources: SourceService) => {
        const drafts = new PrismaRoadmapDrafts(db);
        const removal = new SourceServiceRemoval(sources);

        return new RoadmapDraftService(drafts, removal);
      },
    },
  ],
})
export class StudyModule {}
