import { executionsHarness } from './support/executions-http.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Executions HTTP + PostgreSQL',
  () => {
    const context = executionsHarness();
    const { api, student, payload, queue } = context;

    it('authorizes all operations, validates input and captures only saved server context', async () => {
      const alice = await student();
      const bob = await student();

      const path = `workspaces/${alice.workspaceId}`;
      const body = payload();

      await api('post', path).send(body).expect(401);
      await api('post', path, bob.cookie).send(body).expect(404);
      await api('post', path, alice.cookie)
        .set('Origin', 'https://attacker.test')
        .send(body)
        .expect(403);
      await api('post', path, alice.cookie)
        .send({ ...body, files: {}, status: 'completed' })
        .expect(400);
      await api('post', path, alice.cookie)
        .send({ ...body, revision: 99 })
        .expect(409);
      await api('post', path, alice.cookie)
        .send({ ...body, kind: 'embedding' })
        .expect(400);

      const created = await api('post', path, alice.cookie)
        .send(body)
        .expect(201);
      const id = created.body.id;
      const record = await context.db.execution.findUniqueOrThrow({
        where: { id },
      });
      const workspace = await context.db.workspace.findUniqueOrThrow({
        where: { id: alice.workspaceId },
        include: { session: true },
      });

      expect(record.input).toMatchObject({
        files: workspace.files,
        sessionId: workspace.session!.id,
        stepId: 'validate-input',
      });
      expect(queue.publish).toHaveBeenCalledTimes(1);

      await api('get', id, bob.cookie).expect(404);
      await api('post', `${id}/cancel`, bob.cookie).send({}).expect(404);
      await api('post', `${id}/ticket`, bob.cookie).send({}).expect(404);
      await api('get', path, bob.cookie).expect(404);

      const resumed = await api('get', id, alice.cookie).expect(200);

      expect(resumed.headers['cache-control']).toBe('no-store');
      expect(resumed.body).not.toHaveProperty('input');
      expect(resumed.body).not.toHaveProperty('lease');

      await api('post', path, alice.cookie)
        .send({ ...body, prompt: 'different' })
        .expect(409);
    });
  },
);
