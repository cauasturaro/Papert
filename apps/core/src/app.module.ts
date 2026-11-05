import { ExecutionModule } from './executions/execution.module.js';
import { StudyModule } from './study/study.module.js';
import { SourceModule } from './sources/source.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CommunityModule } from './community/community.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
