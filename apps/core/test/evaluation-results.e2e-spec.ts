import {
  FIRST_CRITERIA,
  evaluationHarness,
  met,
} from './support/evaluation.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Analysis, evaluation and progression',
  () => {
    const context = evaluationHarness();
    const { student, save, analyze, evaluation, deliver, workspace } = context;

    describe('untrusted results', () => {
      const allMet = met(FIRST_CRITERIA);
      let alice: Awaited<ReturnType<typeof student>>;

      async function analyzed(code: string) {
        const revision = await save(alice.cookie, alice.workspaceId, {
          'src/service.ts': code,
        });
        const created = await analyze(
          alice.cookie,
          alice.workspaceId,
          revision,
        ).expect(201);
        const input = (
          await context.db.execution.findUniqueOrThrow({
            where: { id: created.body.id },
          })
        ).input as { attemptId: string };

        return { id: created.body.id as string, revision, input };
      }

      async function resultOf(revision: number) {
        const current = await workspace(alice.cookie, alice.workspaceId);
        const attempt = current.attempts.find(
          (item: { revision: number }) => item.revision === revision,
        );

        return { step: current.currentStep, result: attempt.result };
      }

      it('never approves on invalid output, another attempt or a missing evaluation', async () => {
        alice = await student();

        const first = await analyzed('export const a = 1;\n');

        await deliver(first.id, {
          ...evaluation(
            first.input.attemptId,
            first.revision,
            'validate-input',
            allMet,
          ),
          approved: true,
        });

        expect(await resultOf(first.revision)).toEqual({
          step: 0,
          result: expect.objectContaining({
            status: 'analysis_failed',
            reason: 'invalid_output',
          }),
        });

        const second = await analyzed('export const b = 2;\n');

        await deliver(
          second.id,
          evaluation(
            first.input.attemptId,
            first.revision,
            'validate-input',
            allMet,
          ),
        );

        expect(await resultOf(second.revision)).toEqual({
          step: 0,
          result: expect.objectContaining({ reason: 'other_attempt' }),
        });

        const third = await analyzed('export const c = 3;\n');

        await deliver(
          third.id,
          evaluation(third.input.attemptId, third.revision, 'validate-input', {
            'valid-name': 'met',
            greeting: 'met',
          }),
        );

        expect(await resultOf(third.revision)).toEqual({
          step: 0,
          result: expect.objectContaining({ reason: 'criteria_mismatch' }),
        });

        const fourth = await analyzed('export const d = 4;\n');

        await deliver(fourth.id, undefined);

        expect(await resultOf(fourth.revision)).toEqual({
          step: 0,
          result: expect.objectContaining({ reason: 'no_evaluation' }),
        });
      });

      it('ignores a superseded lease and allows a retry after a failed analysis', async () => {
        alice = await student();

        // A result from a superseded lease is settled for billing but cannot approve.
        const fifth = await analyzed('export const e = 5;\n');
        const stale = await context.worker.claim(fifth.id);

        await context.worker.failed(fifth.id, stale.lease!);

        const retry = await context.worker.claim(fifth.id);

        expect(retry.lease).not.toBe(stale.lease);

        const staleEvent = {
          version: 1,
          executionId: fifth.id,
          lease: stale.lease!,
          index: 100,
          status: 'completed',
          text: 'Old result',
          tokens: 100,
          evaluation: evaluation(
            fifth.input.attemptId,
            fifth.revision,
            'validate-input',
            allMet,
          ),
        };

        await context.worker.accept(staleEvent);

        expect(await resultOf(fifth.revision)).toEqual({
          step: 0,
          result: expect.objectContaining({ status: 'evaluating' }),
        });

        // A failed analysis may be retried for the same revision and then approved.
        const failureEvent = {
          version: 1,
          executionId: fifth.id,
          lease: retry.lease!,
          index: 100,
          status: 'failed',
          text: 'Analysis failed.',
          tokens: 100,
        };

        await context.worker.accept(failureEvent);

        expect(await resultOf(fifth.revision)).toEqual({
          step: 0,
          result: expect.objectContaining({
            status: 'analysis_failed',
            reason: 'failed',
          }),
        });

        const again = await analyze(
          alice.cookie,
          alice.workspaceId,
          fifth.revision,
        ).expect(201);

        await deliver(
          again.body.id,
          evaluation(
            fifth.input.attemptId,
            fifth.revision,
            'validate-input',
            allMet,
          ),
        );

        expect(await resultOf(fifth.revision)).toEqual({
          step: 1,
          result: expect.objectContaining({ status: 'approved' }),
        });
      });
    });
  },
);
