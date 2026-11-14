import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { WorkerEvent } from '../domain/execution.js';
import type { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import { workerEvent } from '../application/contracts/worker-event.contract.js';
import { PrismaExecutionLifecycle } from './prisma-execution-lifecycle.js';
import { SqsExecutionQueue } from './sqs-execution-queue.js';

const transport = vi.hoisted(() => ({
  send: vi.fn(),
  claim: vi.fn(),
  failed: vi.fn(),
  active: vi.fn(),
  liveSources: vi.fn(),
}));

vi.mock('@aws-sdk/client-sqs', async (original) => ({
  ...(await original<typeof import('@aws-sdk/client-sqs')>()),
  SQSClient: class {
    send = transport.send;
  },
}));
vi.mock('@nestjs/core', () => ({
  NestFactory: {
    createApplicationContext: async () => ({ get: () => transport }),
  },
}));
vi.mock('../../app.module.js', () => ({ AppModule: class {} }));
vi.mock('node:crypto', async (original) => ({
  ...(await original<typeof import('node:crypto')>()),
  randomUUID: () => '22222222-2222-4222-8222-222222222222',
}));

import { workerControl } from './lambda-handlers.js';

type RpcCase = {
  name: string;
  request: {
    action: string;
    executionId: string;
    lease?: string;
    claimId?: string;
  };
  response: {
    status?: string;
    input?: { kind: string; mode?: string };
    sourceIds?: string[];
    active?: boolean;
  };
};
type Fixture<T> = {
  valid: T[];
  invalid: {
    name: string;
    payload: unknown;
    rejection: { service: string; exception: string };
  }[];
};

function fixtures<T = RpcCase>(name: string): Fixture<T> {
  const path = new URL(
    `../../../../../contracts/${name}/fixtures.json`,
    import.meta.url,
  );

  return JSON.parse(readFileSync(path, 'utf8'));
}

it.each(fixtures<{ name: string; payload: WorkerEvent }>('worker-event').valid)(
  'accepts shared worker event $name',
  ({ payload }) => {
    expect(workerEvent.parse(payload)).toEqual(payload);
  },
);

it.each(fixtures('worker-event').invalid)(
  'rejects shared worker event $name',
  ({ payload, rejection }) => {
    expect(rejection).toEqual({ service: 'core', exception: 'ZodError' });
    expect(() => workerEvent.parse(payload)).toThrowError(z.ZodError);
  },
);

it('publishes the shared execution envelope through the real queue adapter', async () => {
  const payload = fixtures<{
    payload: { version: number; executionId: string };
  }>('execution-job').valid[0].payload;
  vi.stubEnv('CHAT_QUEUE_URL', 'https://queue.test/executions');
  transport.send.mockResolvedValue({});

  try {
    await new SqsExecutionQueue().publish(payload.executionId);

    const command = transport.send.mock.calls.at(-1)![0];
    expect(JSON.parse(command.input.MessageBody)).toEqual(payload);
  } finally {
    vi.unstubAllEnvs();
  }
});

for (const action of ['claim', 'active', 'failed', 'sources']) {
  const contract = fixtures(`execution-${action}`);

  it.each(contract.valid)(
    `dispatches shared ${action} RPC $name`,
    async ({ request, response }) => {
      const method = action === 'sources' ? 'liveSources' : action;
      let returned: unknown = response;
      if (action === 'sources') {
        returned = response.sourceIds;
      } else if (action === 'active') {
        returned = response.active;
      }

      transport[method as keyof typeof transport].mockResolvedValue(returned);
      const log = vi.spyOn(console, 'info').mockImplementation(() => {});

      try {
        const answer = await workerControl(request);

        expect(answer).toEqual(response);
        const arguments_ =
          action === 'claim'
            ? [request.executionId, request.claimId]
            : [request.executionId, request.lease];
        expect(
          transport[method as keyof typeof transport],
        ).toHaveBeenLastCalledWith(...arguments_);
      } finally {
        log.mockRestore();
      }
    },
  );

  it.each(contract.invalid)(
    `rejects shared ${action} RPC $name`,
    async ({ payload, rejection }) => {
      expect(rejection).toEqual({ service: 'core', exception: 'ZodError' });

      await expect(workerControl(payload)).rejects.toMatchObject({
        name: 'ZodError',
      });
    },
  );
}

it.each(fixtures('execution-claim').valid)(
  'builds shared claim answer $name',
  async ({ request, response, name }) => {
    const now = new Date('2026-01-01T00:00:00Z');
    let status = name;
    if (response.status === 'running') {
      status = 'queued';
    } else if (name === 'busy') {
      status = 'running';
    }

    const job = {
      id: request.executionId,
      status,
      input: response.input ?? { kind: 'chat' },
      deadline: new Date(now.getTime() + 120000),
      leaseUntil: name === 'busy' ? new Date(now.getTime() + 60000) : null,
      reserved: 48000,
      attempts: 0,
    };
    const tx = {
      $queryRaw: async () => [{ id: job.id }],
      execution: {
        findUniqueOrThrow: async () => job,
        update: async () => job,
      },
      executionQuota: { update: async () => ({}) },
    };
    const db = {
      $transaction: async (run: (client: typeof tx) => unknown) => run(tx),
    };
    const lifecycle = new PrismaExecutionLifecycle(
      db as unknown as PrismaService,
      () => now,
      null!,
      null!,
      null!,
      null!,
      null!,
    );

    const answer = await lifecycle.claim(request.executionId, request.claimId);

    expect(answer).toEqual(response);
  },
);

it.each(fixtures('execution-failed').valid)(
  'builds shared failed-attempt answer $name',
  async ({ request, response }) => {
    const now = new Date('2026-01-01T00:00:00Z');
    const job = {
      id: request.executionId,
      status: response.status === 'retry' ? 'running' : response.status,
      lease: request.lease,
      input: { kind: 'chat' },
      attempts: 1,
      reserved: 2000,
    };
    const tx = {
      $queryRaw: async () => [{ id: job.id }],
      execution: {
        findUniqueOrThrow: async () => job,
        update: async () => job,
      },
    };
    const db = {
      $transaction: async (run: (client: typeof tx) => unknown) => run(tx),
    };
    const lifecycle = new PrismaExecutionLifecycle(
      db as unknown as PrismaService,
      () => now,
      null!,
      null!,
      null!,
      null!,
      null!,
    );

    const answer = await lifecycle.failed(request.executionId, request.lease!);

    expect(answer).toEqual(response);
  },
);
