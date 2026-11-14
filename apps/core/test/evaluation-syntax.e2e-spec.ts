import { evaluationHarness } from './support/evaluation.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Analysis, evaluation and progression',
  () => {
    const context = evaluationHarness();
    const { api, student, save, analyze } = context;

    it('rejects syntax errors before the queue without consuming inference quota', async () => {
      const alice = await student();

      const revision = await save(alice.cookie, alice.workspaceId, {
        'src/service.ts': 'export function greet(name: string {\n',
        Dockerfile: 'FROM node:24\nRUNN npm ci\n',
        'README.md': 'Notes are not syntax-checked.',
      });

      const response = await analyze(
        alice.cookie,
        alice.workspaceId,
        revision,
      ).expect(201);

      expect(response.body.status).toBe('syntax_error');
      expect(response.body.syntax).toMatchObject({
        status: 'failed',
        coverage: 'partial',
        unchecked: ['README.md'],
      });

      const failedPaths = response.body.syntax.diagnostics.map(
        (item: { path: string }) => item.path,
      );

      expect([...new Set(failedPaths)]).toEqual([
        'Dockerfile',
        'src/service.ts',
      ]);
      expect(response.body.attempt.result.status).toBe('syntax_error');

      const quota = await api('get', '/executions/quota', alice.cookie).expect(
        200,
      );

      expect(quota.body).toMatchObject({ used: 0, reserved: 0 });
      expect(context.queue.publish).not.toHaveBeenCalled();
      expect(
        await context.db.execution.count({
          where: { workspaceId: alice.workspaceId },
        }),
      ).toBe(0);
    });
  },
);
