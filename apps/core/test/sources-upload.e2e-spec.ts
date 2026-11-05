import { sourcesHarness } from './support/sources.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Sources HTTP + PostgreSQL',
  () => {
    const context = sourcesHarness();
    const { api, student } = context;

    it('registers before upload, isolates workspaces and validates declarations', async () => {
      const alice = await student();
      const bob = await student();

      const pdf = {
        filename: 'architecture.pdf',
        contentType: 'application/pdf',
        size: 42,
      };

      await api('post', alice.base).send(pdf).expect(401);

      const registered = await api('post', alice.base, alice.cookie)
        .send(pdf)
        .expect(201);
      const row = await context.db.sourceDocument.findUniqueOrThrow({
        where: { id: registered.body.source.id },
      });

      expect(registered.body.source.status).toBe('awaiting_upload');
      expect(registered.body.upload).toMatchObject({
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
      });
      expect(row).toMatchObject({
        workspaceId: alice.workspaceId,
        uploadedByUserId: alice.userId,
        bucket: 'papert-sources',
        objectKey: `documents/${row.id}/original.pdf`,
      });

      await api('get', alice.base, bob.cookie).expect(404);
      await api('post', alice.base, bob.cookie).send(pdf).expect(404);
      await api('delete', `${alice.base}/${row.id}`, bob.cookie)
        .send({})
        .expect(404);
      await api(
        'get',
        '/study/workspaces/not-a-uuid/sources',
        alice.cookie,
      ).expect(404);

      const invalid = [
        { ...pdf, filename: 'script.exe' },
        { ...pdf, contentType: 'text/html' },
        { ...pdf, size: 15 * 1024 * 1024 + 1 },
        { ...pdf, workspaceId: bob.workspaceId },
      ];

      for (const body of invalid) {
        await api('post', alice.base, alice.cookie).send(body).expect(400);
      }

      const listed = await api('get', alice.base, alice.cookie).expect(200);
      const bobListed = await api('get', bob.base, bob.cookie).expect(200);

      expect(listed.body.map((item: { id: string }) => item.id)).toEqual([
        row.id,
      ]);
      expect(bobListed.body).toEqual([]);
    });

    it('enforces workspace limits, expires uploads and retries failed purges', async () => {
      const alice = await student();

      const body = { filename: 'n.md', contentType: 'text/markdown', size: 1 };

      for (let index = 0; index < 20; index += 1) {
        await api('post', alice.base, alice.cookie).send(body).expect(201);
      }

      await api('post', alice.base, alice.cookie).send(body).expect(409);

      const [newest] = (await api('get', alice.base, alice.cookie).expect(200))
        .body;

      context.storage.failDeletes = true;
      await api('delete', `${alice.base}/${newest.id}`, alice.cookie)
        .send({})
        .expect(204);

      const unpurged = await context.db.sourceDocument.findUniqueOrThrow({
        where: { id: newest.id },
      });

      expect(unpurged.purgedAt).toBeNull();

      await context.db.sourceDocument.updateMany({
        where: { workspaceId: alice.workspaceId, status: 'awaiting_upload' },
        data: { uploadExpiresAt: new Date(Date.now() - 1000) },
      });
      context.storage.failDeletes = false;

      const swept = await context.sources.maintenance();
      const purged = await context.db.sourceDocument.findUniqueOrThrow({
        where: { id: newest.id },
      });
      const expired = await context.db.sourceDocument.count({
        where: { workspaceId: alice.workspaceId, errorCode: 'upload_expired' },
      });

      expect(swept.expired).toBeGreaterThanOrEqual(19);
      expect(purged.purgedAt).not.toBeNull();
      expect(expired).toBe(19);

      // Ten more fill the 30-per-day registration allowance after deleting old sources.
      await context.db.sourceDocument.updateMany({
        where: { workspaceId: alice.workspaceId, status: { not: 'deleted' } },
        data: {
          status: 'deleted',
          deletedAt: new Date(),
          purgedAt: new Date(),
        },
      });

      for (let index = 0; index < 10; index += 1) {
        await api('post', alice.base, alice.cookie).send(body).expect(201);
      }

      await api('post', alice.base, alice.cookie).send(body).expect(429);
    });
  },
);
