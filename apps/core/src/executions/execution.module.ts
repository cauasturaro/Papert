import { PrismaExecutionRepository } from './infrastructure/prisma-execution.repository.js';
import { Module } from '@nestjs/common';
import { ParserSyntaxChecker } from '../analysis/infrastructure/parser-syntax-checker.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { SourceService } from '../sources/application/source.service.js';
import { SourceModule } from '../sources/source.module.js';
import { ExecutionService } from './application/execution.service.js';
import { ExecutionController } from './infrastructure/execution.controller.js';
import { SourceServiceCatalog } from './infrastructure/source-catalog.js';
import {
  ExecutionStream,
  SqsExecutionQueue,
} from './infrastructure/aws-execution.js';

@Module({
  imports: [AuthModule, SourceModule],
  controllers: [ExecutionController],
  providers: [
    {
      provide: ExecutionService,
      inject: [PrismaService, SourceService],
      useFactory: (db: PrismaService, sources: SourceService) =>
        new ExecutionService(
          new PrismaExecutionRepository(db),
          new SqsExecutionQueue(),
          new ParserSyntaxChecker(),
          new SourceServiceCatalog(sources),
        ),
    },
    {
      provide: ExecutionStream,
      inject: [PrismaService, ExecutionService],
      useFactory: (db: PrismaService, executions: ExecutionService) =>
        new ExecutionStream(db, executions),
    },
  ],
  exports: [ExecutionService, ExecutionStream],
})
export class ExecutionModule {}
