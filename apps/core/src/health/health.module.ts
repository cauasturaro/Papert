import { Module } from '@nestjs/common';
import { HealthController } from './infrastructure/health.controller.js';
import { HealthService } from './application/health.service.js';

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
