import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { HealthStatus } from '../domain/health.js';

/**
 * Application service: orchestrates the health probe.
 * Uses PrismaService as an infrastructure adapter to check DB connectivity.
 */
@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'connected' };
    } catch {
      return { status: 'degraded', db: 'unreachable' };
    }
  }
}
