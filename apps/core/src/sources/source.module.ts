import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { SourceService } from './application/source.service.js';
import { PrismaSourceRepository } from './infrastructure/prisma-source.repository.js';
import { S3SourceStorage } from './infrastructure/s3-source.storage.js';
import { SourceController } from './infrastructure/source.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [SourceController],
  providers: [
    {
      provide: SourceService,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => {
        const repository = new PrismaSourceRepository(db);
        const storage = new S3SourceStorage();

        return new SourceService(repository, storage);
      },
    },
  ],
  exports: [SourceService],
})
export class SourceModule {}
