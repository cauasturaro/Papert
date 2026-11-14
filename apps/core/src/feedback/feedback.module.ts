import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ExecutionService } from '../executions/application/execution.service.js';
import { ExecutionModule } from '../executions/execution.module.js';
import { PrismaService } from '../common/infrastructure/database/prisma.service.js';
import { FeedbackService } from './application/feedback.service.js';
import { ExecutionServiceAnswers } from './infrastructure/execution-answers.js';
import { FeedbackController } from './infrastructure/feedback.controller.js';
import {
  LangfuseFeedbackSink,
  langfuseSettings,
} from './infrastructure/langfuse-feedback-sink.js';
import { PrismaFeedbackRepository } from './infrastructure/prisma-feedback-repository.js';

@Module({
  imports: [AuthModule, ExecutionModule],
  controllers: [FeedbackController],
  providers: [
    {
      provide: FeedbackService,
      inject: [PrismaService, ExecutionService],
      useFactory: (db: PrismaService, executions: ExecutionService) =>
        new FeedbackService(
          new PrismaFeedbackRepository(db),
          new ExecutionServiceAnswers(executions),
          new LangfuseFeedbackSink(langfuseSettings(process.env)),
          () => new Date(),
        ),
    },
  ],
  exports: [FeedbackService],
})
export class FeedbackModule {}
