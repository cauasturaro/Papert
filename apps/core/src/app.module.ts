import { ExecutionModule } from './executions/execution.module.js';
import { StudyModule } from './study/study.module.js';
import { SourceModule } from './sources/source.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CommunityModule } from './community/community.module.js';
import { MemoryModule } from './memory/memory.module.js';
import { FeedbackModule } from './feedback/feedback.module.js';
import { EngagementModule } from './engagement/engagement.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './common/infrastructure/database/database.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    StudyModule,
    ExecutionModule,
    SourceModule,
    CommunityModule,
    MemoryModule,
    FeedbackModule,
    EngagementModule,
  ],
})
export class AppModule {}
