import { sourcesHarness } from './support/sources.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Sources HTTP + PostgreSQL',
  () => {
    const context = sourcesHarness();
    const { api, student, created, completed } = context;

    it('reindexes only finished sources whose upload was valid', async () => {
      const alice = await student();

      const body = {
        filename: 'guide.pdf',
        contentType: 'application/pdf',
        size: 42,
      };
      const ready = await api('post', alice.base, alice.cookie)
        .send(body)
        .expect(201);
      const pending = await api('post', alice.base, alice.cookie)
        .send(body)
        .expect(201);
      const tampered = await api('post', alice.base, alice.cookie)
        .send(body)
        .expect(201);

      await context.sources.control(created(ready.body.source, '0001'));
      await context.sources.control(completed(ready.body.source.id, '0001'));
      await context.sources.control({
        ...created(tampered.body.source, '0001'),
        size: 43,
      });

      const reindexed = await context.sources.control({
        action: 'reindex',
        documentId: ready.body.source.id,
      });
      const notUploaded = await context.sources.control({
        action: 'reindex',
        documentId: pending.body.source.id,
      });
      const invalid = await context.sources.control({
        action: 'reindex',
        documentId: tampered.body.source.id,
      });

      expect(reindexed).toMatchObject({
        outcome: 'process',
        documentId: ready.body.source.id,
        workspaceId: alice.workspaceId,
        key: `documents/${ready.body.source.id}/original.pdf`,
        versionId: 'v-0001',
        sequencer: '0001',
      });
      expect(notUploaded).toMatchObject({ outcome: 'skip' });
      expect(invalid).toMatchObject({ outcome: 'skip' });

      // The current version can complete again after re-extraction.
      const again = await context.sources.control(
        completed(ready.body.source.id, '0001'),
      );

      expect(again).toEqual({ accepted: true, deleted: false });
    });
  },
);
