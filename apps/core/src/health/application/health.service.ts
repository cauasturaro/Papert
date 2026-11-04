import type { DatabaseProbe, HealthStatus } from '../domain/health.js';

export class HealthService {
  constructor(private readonly database: DatabaseProbe) {}

  async check(): Promise<HealthStatus> {
    try {
      await this.database.check();

      return { status: 'ok', db: 'connected' };
    } catch {
      return { status: 'degraded', db: 'unreachable' };
    }
  }
}
