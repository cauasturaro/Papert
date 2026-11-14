import { Module } from '@nestjs/common';
import { HealthController } from './infrastructure/health.controller.js';
import { HealthService } from './application/health.service.js';
import { PrismaService } from '../common/infrastructure/database/prisma.service.js';
import { PrismaDatabaseProbe } from './infrastructure/prisma-database-probe.js';

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: HealthService,
      inject: [PrismaService],
      useFactory: (db: PrismaService) =>
        new HealthService(new PrismaDatabaseProbe(db)),
    },
  ],
})
export class HealthModule {}
