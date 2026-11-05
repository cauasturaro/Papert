import { randomUUID } from 'node:crypto';
import { sourcesHarness } from './support/sources.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Sources HTTP + PostgreSQL',
  () => {
    const context = sourcesHarness();
    const { api, student, created, completed } = context;

    it('accepts only registered, current object versions from ingestion', async () => {
      const alice = await student();

      const registered = await api('post', alice.base, alice.cookie)
        .send({ filename: 'notes.md', contentType: '', size: 42 })
        .expect(201);
      const source = registered.body.source;

      const forged = await context.sources.control({
        ...created(source, '00A1'),
        key: `documents/${randomUUID()}/original.md`,
      });
      const otherBucket = await context.sources.control({
        ...created(source, '00A1'),
        bucket: 'attacker-bucket',
      });
      const otherFormat = await context.sources.control({
        ...created(source, '00A1'),
        key: `documents/${source.id}/original.pdf`,
      });

      expect(forged).toMatchObject({
        outcome: 'reject',
        reason: 'unregistered',
      });
      expect(otherBucket).toMatchObject({ outcome: 'reject' });
      expect(otherFormat).toMatchObject({ outcome: 'reject' });
      await expect(
        context.sources.control({ action: 'begin' }),
      ).rejects.toThrow();

      const first = await context.sources.control(created(source, '00A1'));
      const redelivered = await context.sources.control(
        created(source, '00A1'),
      );

      expect(first).toMatchObject({
        outcome: 'process',
        documentId: source.id,
        workspaceId: alice.workspaceId,
        format: 'md',
      });
      expect(redelivered).toMatchObject({ outcome: 'process' });

      // A newer version supersedes the first; results for the old one are ignored.
      await context.sources.control(created(source, '00B2'));

      const lateOld = await context.sources.control(
        completed(source.id, '00A1'),
      );
      const lateOldBegin = await context.sources.control(
        created(source, '00A1'),
      );
      const current = await context.sources.control(
        completed(source.id, '00B2'),
      );
      const duplicate = await context.sources.control(created(source, '00B2'));
      const lateFailure = await context.sources.control({
        action: 'fail',
        documentId: source.id,
        versionId: 'v-00B2',
        sequencer: '00B2',
        code: 'processing_failed',
      });

      expect(lateOld).toEqual({ accepted: false, deleted: false });
      expect(lateOldBegin).toMatchObject({ outcome: 'stale' });
      expect(current).toEqual({ accepted: true, deleted: false });
      expect(duplicate).toMatchObject({ outcome: 'duplicate' });
      expect(lateFailure).toEqual({ accepted: false, deleted: false });

      const listed = await api('get', alice.base, alice.cookie).expect(200);

      expect(listed.body[0]).toMatchObject({
        status: 'ready',
        chunkCount: 3,
        pageCount: 2,
        error: null,
      });
    });

    it('records explicit failures, tampered sizes and deletions during ingestion', async () => {
      const alice = await student();

      const failing = await api('post', alice.base, alice.cookie)
        .send({
          filename: 'scan.pdf',
          contentType: 'application/pdf',
          size: 42,
        })
        .expect(201);
      const resized = await api('post', alice.base, alice.cookie)
        .send({
          filename: 'size.pdf',
          contentType: 'application/pdf',
          size: 42,
        })
        .expect(201);
      const deleting = await api('post', alice.base, alice.cookie)
        .send({ filename: 'gone.docx', contentType: '', size: 42 })
        .expect(201);

      await context.sources.control(created(failing.body.source, '0001'));

      const failed = await context.sources.control({
        action: 'fail',
        documentId: failing.body.source.id,
        versionId: 'v-0001',
        sequencer: '0001',
        code: 'no_text',
      });
      const tampered = await context.sources.control({
        ...created(resized.body.source, '0001'),
        size: 43,
      });

      expect(failed).toEqual({ accepted: true, deleted: false });
      expect(tampered).toMatchObject({
        outcome: 'invalid',
        reason: 'invalid_upload',
        documentId: resized.body.source.id,
        workspaceId: alice.workspaceId,
      });

      await context.sources.control(created(deleting.body.source, '0001'));
      await api(
        'delete',
        `${alice.base}/${deleting.body.source.id}`,
        alice.cookie,
      )
        .send({})
        .expect(204);

      const afterDelete = await context.sources.control(
        completed(deleting.body.source.id, '0001'),
      );
      const lateEvent = await context.sources.control(
        created(deleting.body.source, '0002'),
      );
      const removal = await context.sources.control({
        action: 'removal',
        bucket: 'papert-sources',
        key: `documents/${deleting.body.source.id}/original.docx`,
      });

      expect(afterDelete).toEqual({ accepted: false, deleted: true });
      expect(lateEvent).toMatchObject({
        outcome: 'deleted',
        documentId: deleting.body.source.id,
        workspaceId: alice.workspaceId,
      });
      expect(removal).toEqual({
        documentId: deleting.body.source.id,
        workspaceId: alice.workspaceId,
        deleted: true,
      });
      expect(context.storage.deleted).toContain(
        `documents/${deleting.body.source.id}/original.docx`,
      );

      const listed = await api('get', alice.base, alice.cookie).expect(200);
      const states = Object.fromEntries(
        listed.body.map(
          (item: {
            filename: string;
            status: string;
            error: { code: string } | null;
          }) => [item.filename, `${item.status}:${item.error?.code ?? ''}`],
        ),
      );

      expect(states).toEqual({
        'scan.pdf': 'failed:no_text',
        'size.pdf': 'failed:invalid_upload',
      });

      await api(
        'delete',
        `${alice.base}/${deleting.body.source.id}`,
        alice.cookie,
      )
        .send({})
        .expect(404);
    });
  },
);
