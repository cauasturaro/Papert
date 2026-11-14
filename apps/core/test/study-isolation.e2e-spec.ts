import { studyHarness } from './support/study.js';

const draft = {
  revision: 0,
  notes: 'Remember to validate input.',
  files: {
    'src/service.ts':
      'export const greet = (name: string) => `Hello ${name}`;\n',
  },
};

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Study isolation and restart HTTP + PostgreSQL',
  () => {
    const context = studyHarness();
    const { api, register, restart, base } = context;

    async function start() {
      const cookie = await register();
      const original = (
        await api('get', `${base}/roadmaps/fixture`, cookie).expect(200)
      ).body;
      const startPath = `${base}/roadmaps/${original.id}/start`;
      const workspace = (
        await api('post', startPath, cookie).send({}).expect(200)
      ).body;

      return {
        cookie,
        original,
        startPath,
        workspace,
        path: `${base}/workspaces/${workspace.id}`,
      };
    }

    it('isolates learner workspaces and marks reads private', async () => {
      const alice = await start();
      const bob = await start();

      await api('get', `${base}/roadmaps/fixture`).expect(401);

      expect(alice.workspace.id).not.toBe(bob.workspace.id);
      expect(alice.workspace.session.id).not.toBe(bob.workspace.session.id);
      expect(alice.workspace.roadmap.id).toBe(bob.workspace.roadmap.id);
      expect(alice.workspace.roadmap.authorName).toBe('Papert');

      await api('get', alice.path, bob.cookie).expect(404);
      await api('put', alice.path, bob.cookie)
        .send({ revision: 0, notes: 'forged', files: {} })
        .expect(404);
      await api('post', `${alice.path}/attempts`, bob.cookie)
        .send({ revision: 0, stepId: 'validate-input' })
        .expect(404);
      await api('get', `${alice.path}/steps/validate-input`, bob.cookie).expect(
        404,
      );
      await api('put', alice.path, alice.cookie).send(draft).expect(200);

      const other = (await api('get', bob.path, bob.cookie).expect(200)).body;

      expect(other.revision).toBe(0);
      expect(other.currentStep).toBe(0);
      expect(other.notes).toBe('');
      expect(other.attempts).toEqual([]);
      expect(
        (await api('get', alice.path, alice.cookie)).headers['cache-control'],
      ).toBe('no-store');
    });

    it('denies locked steps and rejects client-selected progress', async () => {
      const { cookie, path, startPath } = await start();

      await api('get', `${path}/steps/separate-rules`, cookie).expect(403);
      await api('post', `${path}/attempts`, cookie)
        .send({ revision: 0, stepId: 'separate-rules' })
        .expect(403);
      await api('post', startPath, cookie).send({ currentStep: 1 }).expect(400);
    });

    it('protects consolidated roadmap definitions in HTTP and PostgreSQL', async () => {
      const { cookie, original } = await start();

      for (const method of ['put', 'patch', 'delete'] as const) {
        await api(method, `${base}/roadmaps/${original.id}`, cookie)
          .send({ authorName: 'forged', definition: {} })
          .expect(405);
      }

      await expect(
        context.db.roadmap.update({
          where: { id: original.id },
          data: { authorName: 'forged' },
        }),
      ).rejects.toThrow('immutable');
      await expect(
        context.db.roadmap.delete({ where: { id: original.id } }),
      ).rejects.toThrow('immutable');
    });

    it('validates save boundaries and rejects stale revisions', async () => {
      const { cookie, path, original } = await start();

      for (const field of [
        'currentStep',
        'approved',
        'status',
        'userId',
        'roadmapId',
      ]) {
        await api('put', path, cookie)
          .send({ ...draft, [field]: 1 })
          .expect(400);
      }
      await api('put', path, cookie)
        .set('Origin', 'https://attacker.example')
        .send(draft)
        .expect(403);

      const saved = (await api('put', path, cookie).send(draft).expect(200))
        .body;

      expect(saved.revision).toBe(1);
      expect(saved.currentStep).toBe(0);
      expect(saved.roadmap).toEqual(original);
      await api('put', path, cookie).send(draft).expect(409);
    });

    it('records one immutable snapshot per saved revision', async () => {
      const { cookie, path, original } = await start();
      await api('put', path, cookie).send(draft).expect(200);

      await api('post', `${path}/attempts`, cookie)
        .send({
          revision: 1,
          stepId: 'validate-input',
          result: { approved: true },
        })
        .expect(400);
      const attemptBody = { revision: 1, stepId: 'validate-input' };
      const attempt = (
        await api('post', `${path}/attempts`, cookie)
          .send(attemptBody)
          .expect(201)
      ).body;
      const repeated = (
        await api('post', `${path}/attempts`, cookie)
          .send(attemptBody)
          .expect(201)
      ).body;

      expect(repeated.id).toBe(attempt.id);
      expect(attempt.files).toEqual(draft.files);
      expect(attempt.challenge).toEqual(original.definition.steps[0].challenge);
      expect(attempt.result).toEqual({ status: 'not_evaluated' });
      await expect(
        context.db.studyAttempt.update({
          where: { id: attempt.id },
          data: { files: {} },
        }),
      ).rejects.toThrow('immutable');
      await api('patch', `${path}/attempts/${attempt.id}`, cookie)
        .send({ result: { approved: true } })
        .expect(404);
    });

    it('resumes saved work, progress and snapshots after a full application restart', async () => {
      const { cookie, path, original, startPath, workspace } = await start();
      await api('put', path, cookie).send(draft).expect(200);
      const attempt = (
        await api('post', `${path}/attempts`, cookie)
          .send({ revision: 1, stepId: 'validate-input' })
          .expect(201)
      ).body;
      await api('put', path, cookie)
        .send({
          revision: 1,
          notes: 'New notes',
          files: { 'src/service.ts': 'new code' },
        })
        .expect(200);
      // Arrange trusted progress without introducing a public approval endpoint.
      await context.db.workspace.update({
        where: { id: workspace.id },
        data: { currentStep: 1 },
      });

      await restart();
      const resumed = (
        await api('post', startPath, cookie).send({}).expect(200)
      ).body;

      expect(resumed.id).toBe(workspace.id);
      expect(resumed.session.id).toBe(workspace.session.id);
      expect(resumed.notes).toBe('New notes');
      expect(resumed.files['src/service.ts']).toBe('new code');
      expect(resumed.currentStep).toBe(1);
      expect(resumed.attempts).toHaveLength(1);
      expect(resumed.attempts[0]).toEqual(attempt);
      expect(
        (await api('get', `${base}/roadmaps/fixture`, cookie).expect(200)).body,
      ).toEqual(original);
    });
  },
);
