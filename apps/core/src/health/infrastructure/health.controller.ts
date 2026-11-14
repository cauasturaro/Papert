import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from '../application/health.service.js';
import type { HealthStatus } from '../domain/health.js';

/**
 * Adapter: HTTP driving adapter for the health probe.
 * GET /health → HealthStatus JSON
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(): Promise<HealthStatus> {
    const result = await this.healthService.check();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }

    return result;
  }
}
