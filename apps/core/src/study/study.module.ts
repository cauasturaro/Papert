import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { StudyService } from './application/study.service.js';
import { PrismaStudyRepository } from './infrastructure/prisma-study.repository.js';
import { StudyController } from './infrastructure/study.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [StudyController],
  providers: [
    {
      provide: StudyService,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => {
        const repository = new PrismaStudyRepository(db);

        return new StudyService(repository);
      },
    },
  ],
})
export class StudyModule {}
