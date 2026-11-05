import {
  FIRST_CRITERIA,
  evaluationHarness,
  met,
} from './support/evaluation.js';

const SECOND_CRITERIA = ['pure-function', 'boundary-validation'];

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Analysis, evaluation and progression',
  () => {
    const context = evaluationHarness();
    const { api, student, save, analyze, evaluation, deliver, workspace } =
      context;

    it('runs login → roadmap → edit → analysis → correction → approval → next step, unlocking once', async () => {
      const alice = await student();

      // A valid but conceptually wrong solution receives feedback and does not progress.
      const wrongRevision = await save(alice.cookie, alice.workspaceId, {
        'src/service.ts':
          'export const greet = (name: unknown) => `Hello ${String(name)}`;\n',
      });
      const wrong = await analyze(
        alice.cookie,
        alice.workspaceId,
        wrongRevision,
      ).expect(201);

      expect(wrong.body.status).toBe('queued');
      expect(context.queue.publish).toHaveBeenCalledWith(wrong.body.id);

      const claimed = await context.db.execution.findUniqueOrThrow({
        where: { id: wrong.body.id },
      });
      const input = claimed.input as {
        attemptId: string;
        syntax: { coverage: string };
      };

      expect(input.syntax.coverage).toBe('complete');

      await analyze(alice.cookie, alice.workspaceId, wrongRevision).expect(409);

      const rejected = evaluation(
        input.attemptId,
        wrongRevision,
        'validate-input',
        {
          'valid-name': 'not_met',
          'http-errors': 'not_met',
          greeting: 'met',
        },
      );

      await deliver(wrong.body.id, rejected);

      let current = await workspace(alice.cookie, alice.workspaceId);

      expect(current.currentStep).toBe(0);
      expect(current.attempts[0].result).toMatchObject({
        status: 'needs_work',
        evaluation: { hints: rejected.hints },
      });

      // The same revision cannot be re-rolled for a different verdict.
      await analyze(alice.cookie, alice.workspaceId, wrongRevision).expect(409);

      // After a correction, Core approves only when every criterion is met.
      const fixedRevision = await save(alice.cookie, alice.workspaceId, {
        'src/service.ts':
          'export function greet(name: unknown) {\n  if (typeof name !== "string" || !name.trim()) {\n    return { status: 400, body: { message: "Invalid name." } };\n  }\n\n  return { status: 200, body: { greeting: `Hello ${name}` } };\n}\n',
      });
      const fixed = await analyze(
        alice.cookie,
        alice.workspaceId,
        fixedRevision,
      ).expect(201);
      const fixedInput = (
        await context.db.execution.findUniqueOrThrow({
          where: { id: fixed.body.id },
        })
      ).input as { attemptId: string };

      const approved = evaluation(
        fixedInput.attemptId,
        fixedRevision,
        'validate-input',
        met(FIRST_CRITERIA),
      );
      const event = await deliver(fixed.body.id, approved);

      current = await workspace(alice.cookie, alice.workspaceId);

      expect(current.currentStep).toBe(1);
      expect(current.attempts[0]).toMatchObject({
        revision: fixedRevision,
        result: { status: 'approved', executionId: fixed.body.id },
      });

      // Redelivered results are idempotent and never unlock a second step.
      await context.worker.accept(event);

      const laterEvent = { ...event, index: 99 };

      await context.worker.accept(laterEvent);

      current = await workspace(alice.cookie, alice.workspaceId);

      expect(current.currentStep).toBe(1);

      const quota = await api('get', '/executions/quota', alice.cookie).expect(
        200,
      );

      expect(quota.body).toMatchObject({ used: 1800, reserved: 0 });

      // The second step can now be analyzed; completing it finishes the roadmap.
      const finalRevision = await save(alice.cookie, alice.workspaceId, {
        'src/greeting.ts':
          'export const greeting = (name: string) => `Hello ${name}`;\n',
        'src/http.ts':
          'import { greeting } from "./greeting";\n\nexport function handle(body: { name?: unknown }) {\n  if (typeof body.name !== "string" || !body.name) {\n    return { status: 400 };\n  }\n\n  return { status: 200, body: greeting(body.name) };\n}\n',
      });
      const last = await analyze(
        alice.cookie,
        alice.workspaceId,
        finalRevision,
      ).expect(201);
      const lastInput = (
        await context.db.execution.findUniqueOrThrow({
          where: { id: last.body.id },
        })
      ).input as { attemptId: string; stepId: string };

      expect(lastInput.stepId).toBe('separate-rules');

      await deliver(
        last.body.id,
        evaluation(
          lastInput.attemptId,
          finalRevision,
          'separate-rules',
          met(SECOND_CRITERIA),
        ),
      );

      current = await workspace(alice.cookie, alice.workspaceId);

      expect(current.currentStep).toBe(2);

      await analyze(alice.cookie, alice.workspaceId, finalRevision).expect(409);
      await api(
        'post',
        `/study/workspaces/${alice.workspaceId}/attempts`,
        alice.cookie,
      )
        .send({ revision: finalRevision, stepId: 'separate-rules' })
        .expect(403);
    });
  },
);
