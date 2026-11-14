import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { executionsHarness } from './support/executions-http.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Executions HTTP + PostgreSQL',
  () => {
    const context = executionsHarness();
    const { api, student, payload, event, origin } = context;

    it('authorizes tutor context, solution eligibility and per-execution token budgets', async () => {
      const alice = await student();

      const path = `workspaces/${alice.workspaceId}`;
      const tutor = {
        ...payload(),
        mode: 'doubt',
        effort: 'high',
        activeFile: 'src/service.ts',
        selection: { start: 0, end: 5 },
      };

      await api('post', path, alice.cookie)
        .send({ ...tutor, solutionAllowed: true })
        .expect(400);
      await api('post', path, alice.cookie)
        .send({ ...tutor, activeFile: '../.env' })
        .expect(400);
      await api('post', path, alice.cookie)
        .send({ ...tutor, selection: { start: 0, end: 9999 } })
        .expect(400);
      await api('post', path, alice.cookie)
        .send({ ...tutor, kind: 'analysis' })
        .expect(400);
      await api('post', path, alice.cookie)
        .send({ ...tutor, mode: 'solution' })
        .expect(403);

      const created = await api('post', path, alice.cookie)
        .send(tutor)
        .expect(201);
      const claim = await context.worker.claim(created.body.id);

      expect(claim.budget).toBe(8000);
      expect(claim.input).toMatchObject({
        activeFile: 'src/service.ts',
        selection: { start: 0, end: 5 },
        mode: 'doubt',
        effort: 'high',
        solutionAllowed: false,
        stepTitle: 'Validate the request',
      });
      expect(await context.service.quota(alice.userId)).toMatchObject({
        used: 8000,
        reserved: 16000,
      });

      await api('post', path, alice.cookie)
        .send({ ...tutor, effort: 'low' })
        .expect(409);

      await expect(
        context.worker.accept(
          event(created.body.id, claim.lease!, 100, 'completed', 8001),
        ),
      ).rejects.toThrow();

      await context.worker.accept(
        event(created.body.id, claim.lease!, 100, 'completed', 2500),
      );

      expect(await context.service.quota(alice.userId)).toMatchObject({
        used: 2500,
        reserved: 0,
      });

      const studyPath = `/study/workspaces/${alice.workspaceId}`;
      for (let revision = 0; revision < 3; revision++) {
        const saved = await request(context.app.getHttpServer())
          .put(studyPath)
          .set('Cookie', alice.cookie)
          .set('Origin', origin)
          .send({
            revision,
            notes: '',
            files: { 'src/service.ts': `// Attempt ${revision + 1}\n` },
          })
          .expect(200);

        await request(context.app.getHttpServer())
          .post(`${studyPath}/attempts`)
          .set('Cookie', alice.cookie)
          .set('Origin', origin)
          .send({ revision: saved.body.revision, stepId: 'validate-input' })
          .expect(201);
      }

      // Recorded attempts alone do not unlock Solution guidance; analyzed ones do.
      const recordedOnly = await api('post', path, alice.cookie)
        .send({
          ...tutor,
          revision: 3,
          requestKey: randomUUID(),
          mode: 'solution',
        })
        .expect(403);

      expect(recordedOnly.body.message).toContain('analyzed attempts');

      await context.db.studyAttempt.updateMany({
        where: { workspaceId: alice.workspaceId, stepId: 'validate-input' },
        data: { result: { status: 'needs_work' } },
      });

      const allowed = await api('post', path, alice.cookie)
        .send({
          ...tutor,
          revision: 3,
          requestKey: randomUUID(),
          mode: 'solution',
        })
        .expect(201);
      const allowedClaim = await context.worker.claim(allowed.body.id);

      expect(allowedClaim.input).toMatchObject({
        mode: 'solution',
        solutionAllowed: true,
      });

      await context.worker.accept(
        event(allowed.body.id, allowedClaim.lease!, 100, 'completed', 100),
      );

      const legacy = await context.service.create(
        alice.userId,
        alice.workspaceId,
        {
          ...payload(),
          revision: 3,
        },
      );
      const legacyClaim = await context.worker.claim(legacy.id);

      expect(legacyClaim.budget).toBe(1000);
      await expect(
        context.worker.accept(
          event(legacy.id, legacyClaim.lease!, 100, 'completed', 1001),
        ),
      ).rejects.toThrow('budget');
      expect(
        (
          await context.db.workspace.findUniqueOrThrow({
            where: { id: alice.workspaceId },
          })
        ).currentStep,
      ).toBe(0);
    });
  },
);
