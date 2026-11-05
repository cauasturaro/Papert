import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { SourceService } from '../sources/application/source.service.js';
import { SourceModule } from '../sources/source.module.js';
import { RoadmapDraftService } from '../study/application/roadmap-draft.service.js';
import { StudyService } from '../study/application/study.service.js';
import { StudyModule } from '../study/study.module.js';
import { CommunityService } from './application/community.service.js';
import { PublicationService } from './application/publication.service.js';
import { ShowcasePublisher } from './application/showcase-publisher.js';
import { CommunityController } from './infrastructure/community.controller.js';
import { PrismaLibraryRepository } from './infrastructure/prisma-library-repository.js';
import { PrismaPublicationRepository } from './infrastructure/prisma-publication-repository.js';
import { PrismaVoteRepository } from './infrastructure/prisma-vote-repository.js';
import { SourceReferences } from './infrastructure/source-references.js';
import { StudyCommunityRoadmaps } from './infrastructure/study-roadmaps.js';

@Module({
  imports: [AuthModule, StudyModule, SourceModule],
  controllers: [CommunityController],
  providers: [
    {
      provide: PrismaPublicationRepository,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => new PrismaPublicationRepository(db),
    },
    {
      provide: StudyCommunityRoadmaps,
      inject: [StudyService],
      useFactory: (study: StudyService) => new StudyCommunityRoadmaps(study),
    },
    {
      provide: CommunityService,
      inject: [
        PrismaService,
        PrismaPublicationRepository,
        StudyCommunityRoadmaps,
      ],
      useFactory: (
        db: PrismaService,
        publications: PrismaPublicationRepository,
        roadmaps: StudyCommunityRoadmaps,
      ) =>
        new CommunityService(
          publications,
          new PrismaVoteRepository(db),
          new PrismaLibraryRepository(db),
          roadmaps,
          new ShowcasePublisher(publications, roadmaps),
        ),
    },
    {
      provide: PublicationService,
      inject: [
        PrismaPublicationRepository,
        StudyCommunityRoadmaps,
        RoadmapDraftService,
        SourceService,
      ],
      useFactory: (
        publications: PrismaPublicationRepository,
        roadmaps: StudyCommunityRoadmaps,
        drafts: RoadmapDraftService,
        sources: SourceService,
      ) =>
        new PublicationService(
          publications,
          roadmaps,
          new SourceReferences(drafts, sources),
        ),
    },
  ],
  exports: [CommunityService],
})
export class CommunityModule {}
