import { randomUUID } from 'node:crypto';
import {
  GENERATION_ATTEMPT_BUDGET,
  MAX_ATTEMPTS,
} from '../src/executions/domain/admission/quota.js';
import { candidate } from './support/roadmap-draft-candidate.js';
import { roadmapDraftsHarness } from './support/roadmap-drafts.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Roadmap drafts HTTP + PostgreSQL',
  () => {
    const context = roadmapDraftsHarness();
    const { api, learner, draft, generate, completed } = context;

    it('fails invalid output without a roadmap, refunds the reservation and allows a retry', async () => {
      const alice = await learner();

      const workspaceId = await draft(alice.cookie);

      // Concurrent clicks with different keys: the draft lock admits exactly one.
      const racing = await Promise.all([
        generate(alice.cookie, workspaceId),
        generate(alice.cookie, workspaceId),
        generate(alice.cookie, workspaceId),
      ]);
      const statuses = racing
        .map((response) => response.status)
        .sort((a, b) => a - b);
      const started = racing.find((response) => response.status === 201)!;

      expect(statuses).toEqual([201, 409, 409]);
      expect((await context.executions.quota(alice.userId)).reserved).toBe(
        GENERATION_ATTEMPT_BUDGET * MAX_ATTEMPTS,
      );

      const claim = await context.worker.claim(started.body.id);
      const invalid = candidate(randomUUID(), randomUUID());
      invalid.definition.steps = invalid.definition.steps.slice(0, 2);

      const invalidEvent = completed(started.body.id, claim.lease!, invalid);

      await context.worker.accept(invalidEvent);

      const failed = await api(
        'get',
        `/study/drafts/${workspaceId}`,
        alice.cookie,
      ).expect(200);
      const workspace = await context.db.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
      });
      const quota = await context.executions.quota(alice.userId);

      expect(failed.body).toMatchObject({
        status: 'failed',
        roadmap: null,
        failure: { reason: 'invalid_output' },
      });
      expect(workspace.roadmapId).toBeNull();
      expect(
        await context.db.roadmap.count({
          where: { authorUserId: alice.userId },
        }),
      ).toBe(0);
      expect(quota).toMatchObject({ reserved: 0, used: 4500 });

      const retried = await generate(alice.cookie, workspaceId).expect(201);
      const retrying = await api(
        'get',
        `/study/drafts/${workspaceId}`,
        alice.cookie,
      ).expect(200);

      expect(retrying.body).toMatchObject({
        status: 'generating',
        executionId: retried.body.id,
        failure: null,
      });
    });

    it('reopens a cancelled draft, and discarding deletes its sources and blocks new uploads', async () => {
      const alice = await learner();

      const workspaceId = await draft(alice.cookie);

      const started = await generate(alice.cookie, workspaceId).expect(201);

      await api('post', `/executions/${started.body.id}/cancel`, alice.cookie)
        .send({})
        .expect(201);

      const reopened = await api(
        'get',
        `/study/drafts/${workspaceId}`,
        alice.cookie,
      ).expect(200);

      expect(reopened.body).toMatchObject({
        status: 'open',
        failure: { reason: 'cancelled' },
      });

      const upload = await api(
        'post',
        `/study/workspaces/${workspaceId}/sources`,
        alice.cookie,
      )
        .send({ filename: 'notes.md', contentType: 'text/markdown', size: 42 })
        .expect(201);
      const sourceId = upload.body.source.id as string;

      await api('delete', `/study/drafts/${workspaceId}`, alice.cookie)
        .send({})
        .expect(200);

      const removed = await context.db.sourceDocument.findUniqueOrThrow({
        where: { id: sourceId },
      });

      expect(removed.status).toBe('deleted');
      expect(removed.purgedAt).toBeNull();
      const purge = vi
        .spyOn(context.storage, 'deleteAllVersions')
        .mockRejectedValueOnce(new Error('Storage unavailable'));

      await context.ingestion.maintenance();
      expect(
        (
          await context.db.sourceDocument.findUniqueOrThrow({
            where: { id: sourceId },
          })
        ).purgedAt,
      ).toBeNull();
      purge.mockRestore();
      await context.ingestion.maintenance();

      expect(
        context.storage.deleted.some((key) => key.includes(sourceId)),
      ).toBe(true);

      await api(
        'post',
        `/study/workspaces/${workspaceId}/sources`,
        alice.cookie,
      )
        .send({ filename: 'late.md', contentType: 'text/markdown', size: 42 })
        .expect(404);
      await api('get', `/study/drafts/${workspaceId}`, alice.cookie).expect(
        404,
      );
      await generate(alice.cookie, workspaceId).expect(404);
      await api('delete', `/study/drafts/${workspaceId}`, alice.cookie)
        .send({})
        .expect(200);
    });
  },
);
