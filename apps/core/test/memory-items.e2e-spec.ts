import { memoryHarness } from './support/memory.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Memory HTTP + PostgreSQL',
  () => {
    const { context, api, item } = memoryHarness();

    it('creates, lists, deduplicates, edits and deletes learner items', async () => {
      const alice = await context.student();
      const original = { kind: 'preference', text: 'Prefers Python examples' };

      const created = await api('post', '', alice.cookie)
        .send(original)
        .expect(201);
      const id = created.body.id as string;

      expect(created.body).toMatchObject({
        ...original,
        status: 'active',
        origin: 'learner',
      });
      expect((await api('get', '', alice.cookie).expect(200)).body).toEqual([
        created.body,
      ]);

      await api('post', '', alice.cookie)
        .send({ ...original, text: '  PREFERS   python examples  ' })
        .expect(409);

      const changed = { kind: 'difficulty', text: 'Needs help with recursion' };
      const updated = await api('patch', `/${id}`, alice.cookie)
        .send(changed)
        .expect(200);

      expect(updated.body).toMatchObject({
        id,
        ...changed,
        status: 'active',
        origin: 'learner',
      });
      expect((await api('get', '', alice.cookie).expect(200)).body).toEqual([
        updated.body,
      ]);

      await api('delete', `/${id}`, alice.cookie).send({}).expect(204);

      expect((await api('get', '', alice.cookie).expect(200)).body).toEqual([]);
      await api('delete', `/${id}`, alice.cookie).send({}).expect(404);
    });

    it('hides another learner’s items from reads and every mutation', async () => {
      const alice = await context.student();
      const bob = await context.student();
      const owned = await item(alice.userId, 'Prefers small examples');

      await api('patch', `/${owned.id}`, bob.cookie)
        .send({ text: 'Forged preference' })
        .expect(404);
      await api('delete', `/${owned.id}`, bob.cookie).send({}).expect(404);
      await api('post', `/${owned.id}/accept`, bob.cookie).send({}).expect(404);

      expect((await api('get', '', bob.cookie).expect(200)).body).toEqual([]);
      expect(
        await context.db.memoryItem.findUnique({ where: { id: owned.id } }),
      ).toMatchObject({ text: owned.text });
    });

    it('lists and accepts proposals and purges expired proposals', async () => {
      const alice = await context.student();
      const future = new Date(Date.now() + 86400000);
      const proposal = await item(alice.userId, 'Prefers diagrams', {
        status: 'proposed',
        origin: 'seymour',
        expiresAt: future,
      });
      const expired = await item(alice.userId, 'Expired suggestion', {
        status: 'proposed',
        origin: 'seymour',
        expiresAt: new Date(Date.now() - 86400000),
      });

      const listed = await api('get', '', alice.cookie).expect(200);

      expect(listed.body).toEqual([
        expect.objectContaining({
          id: proposal.id,
          status: 'proposed',
          origin: 'seymour',
        }),
      ]);
      expect(
        await context.db.memoryItem.findUnique({ where: { id: expired.id } }),
      ).toBeNull();

      const accepted = await api('post', `/${proposal.id}/accept`, alice.cookie)
        .send({})
        .expect(200);

      expect(accepted.body).toMatchObject({
        id: proposal.id,
        status: 'active',
        expiresAt: null,
      });
      expect(
        await context.db.memoryItem.findUnique({ where: { id: proposal.id } }),
      ).toMatchObject({ status: 'active', expiresAt: null });
    });

    it('starts empty conversations only in owned workspaces and hides malformed ids', async () => {
      const alice = await context.student();
      const bob = await context.student();
      const path = `/workspaces/${alice.workspaceId}/conversations`;

      expect((await api('get', path, alice.cookie).expect(200)).body).toEqual(
        [],
      );

      const created = await api('post', path, alice.cookie)
        .send({})
        .expect(201);

      expect(created.body).toMatchObject({ title: null });
      expect((await api('get', path, alice.cookie).expect(200)).body).toEqual([
        created.body,
      ]);

      for (const hidden of [path, '/workspaces/not-a-uuid/conversations']) {
        await api('get', hidden, bob.cookie).expect(404);
        await api('post', hidden, bob.cookie).send({}).expect(404);
      }
    });
  },
);
