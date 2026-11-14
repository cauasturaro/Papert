import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { DAILY_LIMIT } from '../src/executions/domain/admission/quota.js';
import { executionsHarness } from './support/executions-http.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Core and Seymour result replay',
  () => {
    const context = executionsHarness();

    it.each([1, 3])(
      'settles one inference after a failed final send with %i affordable attempts',
      async (affordableAttempts) => {
        const alice = await context.student();
        const priorUsage = DAILY_LIMIT - affordableAttempts * 8000;
        const quota = await context.service.quota(alice.userId);
        await context.db.executionQuota.create({
          data: {
            userId: alice.userId,
            period: quota.period,
            used: priorUsage,
          },
        });
        const job = await context.service.create(
          alice.userId,
          alice.workspaceId,
          { ...context.payload(), mode: 'doubt', effort: 'high' },
        );
        expect(job.reserved).toBe(affordableAttempts * 8000);

        const seymour = fileURLToPath(
          new URL('../../seymour/', import.meta.url),
        );
        const script = fileURLToPath(
          new URL('./support/execution-replay.py', import.meta.url),
        );
        const python =
          process.env.SEYMOUR_PYTHON ?? `${seymour}.venv/bin/python`;
        const child = spawn(python, ['-u', script, job.id], {
          cwd: seymour,
          env: { ...process.env, PYTHONPATH: seymour },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const exited = new Promise<void>((resolve, reject) => {
          let stderr = '';
          child.stderr.on('data', (chunk) => {
            stderr += chunk;
          });
          child.on('error', reject);
          child.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Seymour exited ${code}: ${stderr}`));
            }
          });
        });
        // Attach immediately so a worker crash cannot become an unhandled rejection.
        void exited.catch(() => {});
        const claims: unknown[] = [];
        const failures: unknown[] = [];
        const lines = createInterface({ input: child.stdout });

        try {
          for await (const line of lines) {
            const request = JSON.parse(line);
            let answer: unknown;
            if (request.action === 'claim') {
              claims.push(request);
              answer = await context.worker.claim(
                request.executionId,
                request.claimId,
              );
            } else if (request.action === 'publish') {
              answer = await context.worker.accept(request.event);
            } else if (request.action === 'failed') {
              failures.push(request);
              answer = await context.worker.failed(
                request.executionId,
                request.lease,
              );
            } else if (request.action === 'redeliver') {
              const running = await context.service.owned(alice.userId, job.id);
              expect(running).toMatchObject({
                status: 'running',
                attempts: 1,
                charged: 8000,
              });
              context.now = new Date(context.now.getTime() + 61000);
              answer = {};
            } else {
              throw new Error(`Unexpected worker action: ${request.action}`);
            }

            child.stdin.write(`${JSON.stringify(answer)}\n`);
          }

          await exited;
        } finally {
          child.kill();
          lines.close();
        }

        expect(claims).toHaveLength(2);
        expect(claims[0]).toEqual(claims[1]);
        expect(claims[0]).toMatchObject({ claimId: expect.any(String) });
        expect(failures).toEqual([]);
        expect(await context.service.owned(alice.userId, job.id)).toMatchObject(
          {
            status: 'completed',
            text: 'Saved answer',
            attempts: 1,
            charged: 900,
            reserved: 0,
          },
        );
        expect(await context.service.quota(alice.userId)).toMatchObject({
          used: priorUsage + 900,
          reserved: 0,
        });
      },
      15000,
    );
  },
);
