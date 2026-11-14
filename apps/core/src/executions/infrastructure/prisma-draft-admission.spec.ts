import type { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import type { ExecutionWorkspaces } from '../domain/ports/execution-workspaces.js';
import type { ExecutionRoadmapDrafts } from '../domain/ports/execution-roadmap-drafts.js';
import { admitGeneration } from './prisma-draft-admission.js';

it('reports the actual wait for a rate-limited generation before reserving quota', async () => {
  const now = new Date('2026-11-03T12:00:30Z');
  const tx = {
    $queryRaw: vi
      .fn()
      .mockResolvedValue([{ id: 'quota', used: 0, reserved: 0 }]),
    $executeRaw: vi.fn(),
    execution: {
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(10),
      findFirst: vi
        .fn()
        .mockResolvedValue({ createdAt: new Date('2026-11-03T12:00:00Z') }),
    },
    executionQuota: { update: vi.fn() },
  };
  const db = {
    $transaction: async (run: (client: typeof tx) => unknown) => run(tx),
  } as unknown as PrismaService;
  const workspaces = {
    lock: vi.fn().mockResolvedValue({}),
  } as unknown as ExecutionWorkspaces;
  const drafts = {
    admit: vi.fn().mockResolvedValue({
      sessionId: 'session',
      goal: 'goal',
      level: 'beginner',
    }),
  } as unknown as ExecutionRoadmapDrafts;

  const result = admitGeneration(
    db,
    workspaces,
    drafts,
    () => now,
    'user',
    'workspace',
    { requestKey: 'key', kind: 'generation' },
    [],
  );

  await expect(result).rejects.toMatchObject({
    kind: 'rate_limited',
    retryAfterSeconds: 30,
  });
  expect(tx.executionQuota.update).not.toHaveBeenCalled();
});
