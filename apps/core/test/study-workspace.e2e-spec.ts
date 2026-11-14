import { defaultRoadmapDefinition } from '../src/study/domain/default-roadmap.js';
import { studyHarness } from './support/study.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Study workspace HTTP + PostgreSQL',
  () => {
    const context = studyHarness();
    const { api, register, base } = context;

    it('bounds opt-in workspace history and keeps Solution eligibility from older code versions', async () => {
      const cookie = await register();
      const fixture = (
        await api('get', `${base}/roadmaps/fixture`, cookie).expect(200)
      ).body;
      const started = (
        await api('post', `${base}/roadmaps/${fixture.id}/start`, cookie)
          .send({})
          .expect(200)
      ).body;
      const step = defaultRoadmapDefinition.steps[0];
      const now = Date.now();
      await context.db.studyAttempt.createMany({
        data: Array.from({ length: 100 }, (_, revision) => ({
          workspaceId: started.id,
          revision,
          stepId: step.id,
          challenge: step.challenge,
          files: { 'index.ts': `${revision}` + 'x'.repeat(15_000) },
          result:
            revision < 3
              ? { status: 'needs_work' }
              : { status: 'not_evaluated' },
          createdAt: new Date(now + revision),
        })),
      });
      const path = `${base}/workspaces/${started.id}`;

      const recent = await api('get', `${path}?attempts=recent`, cookie).expect(
        200,
      );
      const full = await api('get', path, cookie).expect(200);

      expect(recent.body.attempts).toHaveLength(20);
      expect(full.body.attempts).toHaveLength(100);
      expect(recent.body.solution).toEqual({
        analyzedAttempts: 3,
        required: 3,
        eligible: true,
      });
      expect(recent.body.solution).toEqual(full.body.solution);
      expect(JSON.stringify(recent.body).length).toBeLessThan(400_000);
    });

    it('keeps the latest feedback per step beyond twenty newer attempts without duplicates', async () => {
      const cookie = await register();
      const fixture = (
        await api('get', `${base}/roadmaps/fixture`, cookie).expect(200)
      ).body;
      const started = (
        await api('post', `${base}/roadmaps/${fixture.id}/start`, cookie)
          .send({})
          .expect(200)
      ).body;
      const [olderStep, currentStep] = defaultRoadmapDefinition.steps;
      const now = Date.now();
      const feedback = {
        status: 'approved',
        evaluation: {
          criteria: olderStep.challenge.criteria.map(({ id }) => ({
            id,
            status: 'met',
            feedback: 'The saved code meets this criterion.',
          })),
        },
      };
      await context.db.studyAttempt.createMany({
        data: Array.from({ length: 25 }, (_, revision) => ({
          workspaceId: started.id,
          revision,
          stepId: revision < 2 ? olderStep.id : currentStep.id,
          challenge: revision < 2 ? olderStep.challenge : currentStep.challenge,
          files: { 'index.ts': `${revision}` },
          result: revision < 2 ? feedback : { status: 'not_evaluated' },
          createdAt: new Date(now + revision),
        })),
      });

      const full = await api(
        'get',
        `${base}/workspaces/${started.id}`,
        cookie,
      ).expect(200);
      const recent = await api(
        'get',
        `${base}/workspaces/${started.id}?attempts=recent`,
        cookie,
      ).expect(200);
      const expected = [
        ...full.body.attempts.slice(0, 20),
        full.body.attempts[23],
      ];

      expect(recent.body.attempts).toEqual(expected);
      expect(recent.body.attempts.at(-1).result).toEqual(feedback);
      expect(
        new Set(
          recent.body.attempts.map((attempt: { id: string }) => attempt.id),
        ).size,
      ).toBe(21);
    });

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
