import { PrismaExecutionRepository } from './infrastructure/prisma-execution.repository.js';
import { Module } from '@nestjs/common';
import { ParserSyntaxChecker } from '../analysis/infrastructure/parser-syntax-checker.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { ExecutionService } from './application/execution.service.js';
import { ExecutionController } from './infrastructure/execution.controller.js';
import {
  ExecutionStream,
  SqsExecutionQueue,
} from './infrastructure/aws-execution.js';

@Module({
  imports: [AuthModule],
  controllers: [ExecutionController],
  providers: [
    {
      provide: ExecutionService,
      inject: [PrismaService],
      useFactory: (db: PrismaService) =>
        new ExecutionService(
          new PrismaExecutionRepository(db),
          new SqsExecutionQueue(),
          new ParserSyntaxChecker(),
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
