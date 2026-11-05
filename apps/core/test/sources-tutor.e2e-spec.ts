import { randomUUID } from 'node:crypto';
import { sourcesHarness } from './support/sources.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Sources HTTP + PostgreSQL',
  () => {
    const context = sourcesHarness();
    const { api, student, created, completed } = context;

    it('lets the tutor search only ready sources and validates @ mentions', async () => {
      const alice = await student();

      const ready = await api('post', alice.base, alice.cookie)
        .send({ filename: 'api.pdf', contentType: 'application/pdf', size: 42 })
        .expect(201);
      const pending = await api('post', alice.base, alice.cookie)
        .send({ filename: 'draft.md', contentType: '', size: 42 })
        .expect(201);

      await context.sources.control(created(ready.body.source, '0001'));
      await context.sources.control(completed(ready.body.source.id, '0001'));

      const chat = (sourceIds: string[]) => ({
        requestKey: randomUUID(),
        revision: 0,
        kind: 'chat',
        mode: 'doubt',
        prompt: 'Give me a request example from @api.pdf',
        sourceIds,
      });
      const executions = `/executions/workspaces/${alice.workspaceId}`;

      const accepted = await api('post', executions, alice.cookie)
        .send(chat([ready.body.source.id]))
        .expect(201);
      const stored = await context.db.execution.findUniqueOrThrow({
        where: { id: accepted.body.id },
      });

      expect(stored.input).toMatchObject({
        workspaceId: alice.workspaceId,
        sourceIds: [ready.body.source.id],
        sources: [
          { id: ready.body.source.id, filename: 'api.pdf', format: 'pdf' },
        ],
      });

      // A completed exchange becomes conversation context for the next message.
      await context.db.execution.update({
        where: { id: accepted.body.id },
        data: { status: 'completed', text: 'The example is on page 4.' },
      });

      const followUp = await api('post', executions, alice.cookie)
        .send({
          ...chat([]),
          sourceIds: undefined,
          prompt: 'Show me that example',
        })
        .expect(201);
      const followUpRow = await context.db.execution.findUniqueOrThrow({
        where: { id: followUp.body.id },
      });

      expect(followUpRow.input).toMatchObject({
        recentTurns: [
          {
            prompt: 'Give me a request example from @api.pdf',
            answer: 'The example is on page 4.',
          },
        ],
      });

      await api('post', executions, alice.cookie)
        .send(chat([pending.body.source.id]))
        .expect(400);
      await api('post', executions, alice.cookie)
        .send(chat([randomUUID()]))
        .expect(400);
      await api('post', executions, alice.cookie)
        .send({ ...chat([ready.body.source.id]), mode: undefined })
        .expect(400);
    });

    it('opens originals only through workspace authorization and drops deleted sources from answers', async () => {
      const alice = await student();
      const bob = await student();

      const register = (filename: string, contentType: string) =>
        api('post', alice.base, alice.cookie)
          .send({ filename, contentType, size: 42 })
          .expect(201);

      const guide = await register('guide.docx', '');
      const draft = await register('draft.pdf', 'application/pdf');
      const guideId = guide.body.source.id as string;

      await context.sources.control(created(guide.body.source, '0001'));
      await context.sources.control(completed(guideId, '0001'));

      // Opening: the owner gets version-pinned links; nobody else learns the source exists.
      const view = await api(
        'get',
        `${alice.base}/${guideId}/view`,
        alice.cookie,
      ).expect(200);

      expect(view.body).toMatchObject({
        renderer: 'paragraphs',
        versionId: 'v-0001',
        original: `http://s3.test/documents/${guideId}/original.docx?version=v-0001&inline`,
        download: `http://s3.test/documents/${guideId}/original.docx?version=v-0001&attachment`,
        rendition: `http://s3.test/renditions/${guideId}/v-0001.json?version=none&inline`,
      });

      await api('get', `${alice.base}/${guideId}/view`, bob.cookie).expect(404);
      await api('get', `${bob.base}/${guideId}/view`, bob.cookie).expect(404);
      await api(
        'get',
        `${alice.base}/${draft.body.source.id}/view`,
        alice.cookie,
      ).expect(409);

      // A running tutor execution may search the source until it is deleted.
      const admitted = await api(
        'post',
        `/executions/workspaces/${alice.workspaceId}`,
        alice.cookie,
      )
        .send({
          requestKey: randomUUID(),
          revision: 0,
          kind: 'chat',
          mode: 'doubt',
          prompt: 'What does the guide say?',
        })
        .expect(201);
      const executionId = admitted.body.id as string;

      const claim = await context.worker.claim(executionId);
      const lease = claim.lease!;

      const beforeDeletion = await context.worker.liveSources(
        executionId,
        lease,
      );

      await api('delete', `${alice.base}/${guideId}`, alice.cookie)
        .send({})
        .expect(204);

      const afterDeletion = await context.worker.liveSources(
        executionId,
        lease,
      );

      expect(beforeDeletion).toEqual([guideId]);
      expect(afterDeletion).toEqual([]);
      expect(context.storage.deleted).toEqual(
        expect.arrayContaining([
          `documents/${guideId}/original.docx`,
          `renditions/${guideId}/`,
        ]),
      );

      await api('get', `${alice.base}/${guideId}/view`, alice.cookie).expect(
        404,
      );

      // A citation produced before the deletion is not stored, nor is its quote.
      const finalEvent = {
        version: 1,
        executionId,
        lease,
        index: 100,
        status: 'completed',
        text: 'The guide explains orders.',
        tokens: 100,
        grounding: {
          support: 'cited',
          citations: [
            {
              sourceId: guideId,
              cite: 'guide.docx, ¶ 2-3',
              location: { paragraphStart: 2, paragraphEnd: 3, heading: null },
              excerpt: 'Orders are JSON.',
              quote: 'Orders are JSON.',
            },
          ],
        },
      };

      const finished = await context.worker.accept(finalEvent);

      expect(finished.grounding).toEqual({
        support: 'unsupported',
        citations: [],
      });
    });
  },
);
