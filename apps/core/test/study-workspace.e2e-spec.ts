import { studyHarness } from './support/study.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Study workspace HTTP + PostgreSQL',
  () => {
    const context = studyHarness();
    const { api, register, base } = context;

    it('persists a multi-file tree and rejects invalid operations without changing the saved revision', async () => {
      const cookie = await register();
      const fixture = (
        await api('get', `${base}/roadmaps/fixture`, cookie).expect(200)
      ).body;
      const started = (
        await api('post', `${base}/roadmaps/${fixture.id}/start`, cookie)
          .send({})
          .expect(200)
      ).body;
      const path = `${base}/workspaces/${started.id}`;
      const files = {
        'src/': '',
        'src/domain/': '',
        'src/domain/service.ts': 'export const answer = 42;',
        'tests/empty/': '',
        'config/settings.yaml': 'enabled: true',
      };

      const created = (
        await api('put', path, cookie)
          .send({ revision: 0, notes: '', files })
          .expect(200)
      ).body;

      expect(created.files).toEqual(files);
      expect(created.revision).toBe(1);

      for (const invalid of [
        { '../secret.ts': 'bad' },
        { src: 'file', 'src/main.ts': 'collision' },
        { 'empty/': 'not empty' },
        { 'src/main.ts': 'a'.repeat(16001) },
      ]) {
        await api('put', path, cookie)
          .send({ revision: 1, notes: '', files: invalid })
          .expect(400);
      }

      const renamedFiles = {
        'lib/': '',
        'lib/domain/': '',
        'lib/domain/service.ts': 'export const answer = 43;',
        'tests/empty/': '',
      };
      const renamed = (
        await api('put', path, cookie)
          .send({
            revision: 1,
            notes: 'Renamed and removed config.',
            files: renamedFiles,
          })
          .expect(200)
      ).body;

      expect(renamed.files).toEqual(renamedFiles);
      expect(renamed.revision).toBe(2);

      await api('put', path, cookie)
        .send({ revision: 1, notes: '', files })
        .expect(409);

      const resumed = (
        await api('post', `${base}/roadmaps/${fixture.id}/start`, cookie)
          .send({})
          .expect(200)
      ).body;

      expect(resumed.files).toEqual(renamedFiles);
      expect(resumed.revision).toBe(2);
    });

    it('serializes concurrent starts, saves and attempt snapshots without losing a revision', async () => {
      const cookie = await register();

      const original = (
        await api('get', `${base}/roadmaps/fixture`, cookie).expect(200)
      ).body;

      const startPath = `${base}/roadmaps/${original.id}/start`;
      const starts = await Promise.all(
        Array.from({ length: 4 }, () =>
          api('post', startPath, cookie).send({}).expect(200),
        ),
      );

      expect(new Set(starts.map((response) => response.body.id)).size).toBe(1);

      const path = `${base}/workspaces/${starts[0].body.id}`;

      const saves = await Promise.all(
        ['first', 'second'].map((notes) =>
          api('put', path, cookie).send({
            revision: 0,
            notes,
            files: { 'src/service.ts': notes },
          }),
        ),
      );

      expect(
        saves.map((response) => response.status).sort((a, b) => a - b),
      ).toEqual([200, 409]);

      const winner = saves.find((response) => response.status === 200)!.body;

      const [snapshot] = await Promise.all([
        api('post', `${path}/attempts`, cookie).send({
          revision: 1,
          stepId: 'validate-input',
        }),
        api('put', path, cookie)
          .send({
            revision: 1,
            notes: 'latest',
            files: { 'src/service.ts': 'latest' },
          })
          .expect(200),
      ]);

      expect([201, 409]).toContain(snapshot.status);

      if (snapshot.status === 201) {
        expect(snapshot.body.files).toEqual(winner.files);
        expect(snapshot.body.revision).toBe(1);
      }

      const current = (await api('get', path, cookie).expect(200)).body;

      expect(current.files['src/service.ts']).toBe('latest');
      expect(current.revision).toBe(2);
      expect(current.currentStep).toBe(0);
    });
  },
);
