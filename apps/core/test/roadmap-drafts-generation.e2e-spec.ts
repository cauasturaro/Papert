import { randomUUID } from 'node:crypto';
import {
  GENERATION_ATTEMPT_BUDGET,
  MAX_ATTEMPTS,
} from '../src/executions/domain/quota.js';
import { GENERATED_AUTHOR_NAME } from '../src/study/domain/roadmap-draft.js';
import { candidate } from './support/roadmap-draft-candidate.js';
import { roadmapDraftsHarness } from './support/roadmap-drafts.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Roadmap drafts HTTP + PostgreSQL',
  () => {
    const context = roadmapDraftsHarness();
    const { api, learner, draft, generate, completed } = context;

    // Skips ingestion: the row is inserted as ready.
    async function readySource(userId: string, workspaceId: string) {
      const id = randomUUID();

      await context.db.sourceDocument.create({
        data: {
          id,
          workspaceId,
          uploadedByUserId: userId,
          bucket: context.storage.bucket,
          objectKey: `documents/${id}/original.md`,
          filename: 'conventions.md',
          format: 'md',
          contentType: 'text/markdown',
          sizeBytes: 900,
          status: 'ready',
          objectVersionId: 'v-1',
          sequencer: '0001',
          chunkCount: 3,
          readyAt: new Date(),
          uploadExpiresAt: new Date(Date.now() + 60_000),
        },
      });

      return id;
    }

    it('generates once, consolidates a private roadmap under redelivery and binds the draft workspace', async () => {
      const alice = await learner();
      const bob = await learner();

      const workspaceId = await draft(alice.cookie);
      const sourceId = await readySource(alice.userId, workspaceId);
      const requestKey = randomUUID();

      const started = await generate(
        alice.cookie,
        workspaceId,
        requestKey,
      ).expect(201);
      const replay = await generate(
        alice.cookie,
        workspaceId,
        requestKey,
      ).expect(201);
      const executionId = started.body.id as string;

      expect(replay.body.id).toBe(executionId);
      expect(started.body).toMatchObject({
        kind: 'generation',
        status: 'queued',
      });
      expect(started.body.reserved).toBe(
        GENERATION_ATTEMPT_BUDGET * MAX_ATTEMPTS,
      );

      await generate(alice.cookie, workspaceId).expect(409);

      const record = await context.db.execution.findUniqueOrThrow({
        where: { id: executionId },
      });

      expect(record.input).toMatchObject({
        kind: 'generation',
        goal: 'Build a reservation API',
        level: 'intermediate',
        sources: [{ id: sourceId, filename: 'conventions.md' }],
      });

      const generating = await api(
        'get',
        `/study/drafts/${workspaceId}`,
        alice.cookie,
      ).expect(200);

      expect(generating.body).toMatchObject({
        status: 'generating',
        executionId,
      });

      const claim = await context.worker.claim(executionId);
      const event = completed(
        executionId,
        claim.lease!,
        candidate(sourceId, randomUUID()),
      );

      await context.worker.accept(event);
      await context.worker.accept(event);

      const generated = await api(
        'get',
        `/study/drafts/${workspaceId}`,
        alice.cookie,
      ).expect(200);
      const authored = await context.db.roadmap.findMany({
        where: { authorUserId: alice.userId },
      });

      expect(authored).toHaveLength(1);
      expect(authored[0].authorName).toBe(GENERATED_AUTHOR_NAME);
      expect(generated.body).toMatchObject({
        status: 'generated',
        failure: null,
        consulted: [{ id: sourceId, filename: 'conventions.md' }],
        roadmap: { id: authored[0].id },
      });
      expect(generated.body.evidence).toEqual([
        expect.objectContaining({
          stepId: 'domain-rules',
          sourceId,
          cite: 'S1',
        }),
      ]);
      // Evidence is private to the draft, never part of the publishable definition.
      expect(authored[0].definition).not.toHaveProperty('evidence');

      const workspace = await context.db.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
      });

      expect(workspace).toMatchObject({
        roadmapId: authored[0].id,
        files: { 'src/reservation.ts': 'export {};\n' },
        revision: 1,
      });
      await expect(
        context.db.workspace.update({
          where: { id: workspaceId },
          data: { roadmapId: null },
        }),
      ).rejects.toThrow();

      const aliceRoadmaps = await api(
        'get',
        '/study/roadmaps',
        alice.cookie,
      ).expect(200);
      const bobRoadmaps = await api(
        'get',
        '/study/roadmaps',
        bob.cookie,
      ).expect(200);
      const aliceIds = aliceRoadmaps.body.map(
        (item: { roadmap: { id: string } }) => item.roadmap.id,
      );
      const bobIds = bobRoadmaps.body.map(
        (item: { roadmap: { id: string } }) => item.roadmap.id,
      );

      expect(aliceIds).toContain(authored[0].id);
      expect(bobIds).not.toContain(authored[0].id);

      await api('post', `/study/roadmaps/${authored[0].id}/start`, bob.cookie)
        .send({})
        .expect(404);

      // Starting resumes the draft workspace, with the sources uploaded before generation.
      const studied = await api(
        'post',
        `/study/roadmaps/${authored[0].id}/start`,
        alice.cookie,
      )
        .send({})
        .expect(200);
      const sources = await api(
        'get',
        `/study/workspaces/${workspaceId}/sources`,
        alice.cookie,
      ).expect(200);
      const drafts = await api('get', '/study/drafts', alice.cookie).expect(
        200,
      );

      expect(studied.body.id).toBe(workspaceId);
      expect(sources.body).toEqual([
        expect.objectContaining({ id: sourceId, status: 'ready' }),
      ]);
      expect(drafts.body).toEqual([]);

      await generate(alice.cookie, workspaceId).expect(409);
    });
  },
);
