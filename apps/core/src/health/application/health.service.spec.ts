import { HealthService } from './health.service.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';

describe('HealthService', () => {
  let healthService: HealthService;
  let prisma: { $queryRaw: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = { $queryRaw: vi.fn() };
    healthService = new HealthService(prisma as unknown as PrismaService);
  });

  it('returns ok when DB query succeeds', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    const result = await healthService.check();
    expect(result).toEqual({ status: 'ok', db: 'connected' });
  });

  it('returns degraded when DB query throws', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    const result = await healthService.check();
    expect(result).toEqual({ status: 'degraded', db: 'unreachable' });
  });
});
