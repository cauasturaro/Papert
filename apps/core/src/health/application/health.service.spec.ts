import { HealthService } from './health.service.js';

describe('HealthService', () => {
  let healthService: HealthService;
  let probe: { check: ReturnType<typeof vi.fn<() => Promise<void>>> };

  beforeEach(() => {
    probe = { check: vi.fn<() => Promise<void>>() };
    healthService = new HealthService(probe);
  });

  it('returns ok when DB query succeeds', async () => {
    probe.check.mockResolvedValueOnce(undefined);

    const result = await healthService.check();

    expect(result).toEqual({ status: 'ok', db: 'connected' });
  });

  it('returns degraded when DB query throws', async () => {
    probe.check.mockRejectedValueOnce(new Error('connection refused'));

    const result = await healthService.check();

    expect(result).toEqual({ status: 'degraded', db: 'unreachable' });
  });
});
