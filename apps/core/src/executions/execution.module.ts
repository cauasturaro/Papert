import { PrismaAttemptProgression } from '../study/infrastructure/prisma-attempt-progression.js';
import { PrismaRoadmapGeneration } from '../study/infrastructure/prisma-roadmap-generation.js';
import { createExecutionStream } from './infrastructure/stream-composition.js';
import { PrismaExecutionRepository } from './infrastructure/prisma-execution.repository.js';
import { Module } from '@nestjs/common';
import { ParserSyntaxChecker } from '../analysis/infrastructure/parser-syntax-checker.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { SourceService } from '../sources/application/source.service.js';
import { SourceModule } from '../sources/source.module.js';
import { ExecutionService } from './application/execution.service.js';
import { ExecutionStreamService } from './application/execution-stream.service.js';
import { ExecutionController } from './infrastructure/execution.controller.js';
import { SourceServiceCatalog } from './infrastructure/source-catalog.js';
import { SqsExecutionQueue } from './infrastructure/aws-execution.js';

@Module({
  imports: [AuthModule, SourceModule],
  controllers: [ExecutionController],
  providers: [
    {
      provide: ExecutionService,
      inject: [PrismaService, SourceService],
      useFactory: (db: PrismaService, sources: SourceService) =>
        new ExecutionService(
          new PrismaExecutionRepository(
            db,
            undefined,
            new PrismaAttemptProgression(),
            new PrismaRoadmapGeneration(),
          ),
          new SqsExecutionQueue(),
          new ParserSyntaxChecker(),
          new SourceServiceCatalog(sources),
        ),
    },
    {
      provide: ExecutionStreamService,
      inject: [PrismaService, ExecutionService],
      useFactory: (db: PrismaService, executions: ExecutionService) =>
        createExecutionStream(db, executions),
    },
  ],
  exports: [ExecutionService, ExecutionStreamService],
})
export class ExecutionModule {}
