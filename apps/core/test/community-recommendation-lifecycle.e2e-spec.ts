import { randomUUID } from 'node:crypto';
import { communityHarness } from './support/community.js';

const MATCHES = [
  { roadmapId: 'hexagonal-architecture-nestjs', similarity: 0.8 },
];

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Community recommendation lifecycle HTTP + PostgreSQL',
  () => {
    const context = communityHarness();
    const { api, learner } = context;

    async function draft() {
      const student = await learner();
      const draftPayload = {
        goal: 'Build a reservation API with ports',
        level: 'intermediate',
      };

      const created = await api('post', '/study/drafts', student.cookie)
        .send(draftPayload)
        .expect(201);

      return { ...student, workspaceId: created.body.workspaceId as string };
    }

    function submit(
      student: { cookie: string; workspaceId: string },
      kind: string,
    ) {
      const payload = { requestKey: randomUUID(), kind };

      return api(
        'post',
        `/executions/workspaces/${student.workspaceId}`,
        student.cookie,
      ).send(payload);
    }

    function read(student: { cookie: string; workspaceId: string }) {
      return api(
        'get',
        `/study/drafts/${student.workspaceId}`,
        student.cookie,
      ).expect(200);
    }

    function decline(student: { cookie: string; workspaceId: string }) {
      return api(
        'post',
        `/study/drafts/${student.workspaceId}/recommendation/decline`,
        student.cookie,
      )
        .send({})
        .expect(200);
    }

    async function complete(executionId: string, matches = MATCHES) {
      const claim = await context.worker.claim(executionId);
      const event = {
        version: 1,
        executionId,
        lease: claim.lease!,
        index: 1,
        status: 'completed',
        text: '',
        tokens: 10,
        recommendation: { matches },
      };

      await context.worker.accept(event);

      return event;
    }

    it("keeps Seymour's match order even when similarities increase", async () => {
      const student = await draft();
      const check = await submit(student, 'recommendation').expect(201);
      const matches = [
        { roadmapId: 'hexagonal-architecture-nestjs', similarity: 0.69 },
        { roadmapId: 'http-service-foundations', similarity: 0.9 },
      ];

      await complete(check.body.id, matches);

      const ready = await read(student);

      expect(ready.body.recommendation).toMatchObject({
        status: 'ready',
        matches,
      });
    });

    it.each(['worker failure', 'cancel', 'timeout'])(
      'requires an explicit decline after %s before admitting generation',
      async (failure) => {
        const student = await draft();
        const check = await submit(student, 'recommendation').expect(201);

        if (failure === 'worker failure') {
          const claim = await context.worker.claim(check.body.id);
          const failureEvent = {
            version: 1,
            executionId: check.body.id,
            lease: claim.lease!,
            index: 1,
            status: 'failed',
            text: 'Catalog check unavailable.',
            tokens: 0,
          };

          await context.worker.accept(failureEvent);
        } else if (failure === 'cancel') {
          await api(
            'post',
            `/executions/${check.body.id}/cancel`,
            student.cookie,
          )
            .send({})
            .expect(201);
        } else {
          await context.db.execution.update({
            where: { id: check.body.id },
            data: { deadline: new Date(Date.now() - 1000) },
          });

          await context.executions.sweep();
        }

        const failed = await read(student);

        expect(failed.body).toMatchObject({
          canGenerate: false,
          recommendation: { status: 'failed', declined: false, matches: [] },
        });

        await submit(student, 'generation').expect(409);

        const declined = await decline(student);

        expect(declined.body).toMatchObject({
          canGenerate: true,
          recommendation: { status: 'failed', declined: true },
        });

        await submit(student, 'generation').expect(201);
      },
    );

    it('ignores repeated and late results for an older check after a new check starts', async () => {
      const student = await draft();
      const first = await submit(student, 'recommendation').expect(201);
      const oldEvent = await complete(first.body.id);
      const second = await submit(student, 'recommendation').expect(201);
      const before = await read(student);
      const lateEvent = {
        ...oldEvent,
        index: 99,
        recommendation: { matches: [] },
      };

      await context.worker.accept(oldEvent);
      await context.worker.accept(lateEvent);

      const after = await read(student);

      expect(after.body).toEqual(before.body);
      expect(after.body.recommendation).toMatchObject({
        executionId: second.body.id,
        status: 'searching',
        declined: false,
        matches: [],
      });

      await complete(second.body.id, []);

      const ready = await read(student);

      expect(ready.body).toMatchObject({
        canGenerate: true,
        recommendation: {
          executionId: second.body.id,
          status: 'ready',
          matches: [],
        },
      });
    });

    it('clears an earlier decline when a new check starts', async () => {
      const student = await draft();
      const first = await submit(student, 'recommendation').expect(201);
      await complete(first.body.id);

      const declined = await decline(student);

      expect(declined.body.canGenerate).toBe(true);
      expect(declined.body.recommendation.declined).toBe(true);

      const second = await submit(student, 'recommendation').expect(201);
      const searching = await read(student);

      expect(searching.body).toMatchObject({
        canGenerate: false,
        recommendation: {
          executionId: second.body.id,
          status: 'searching',
          declined: false,
        },
      });

      await submit(student, 'generation').expect(409);
      await complete(second.body.id);

      const ready = await read(student);

      expect(ready.body).toMatchObject({
        canGenerate: false,
        recommendation: { status: 'ready', declined: false, matches: MATCHES },
      });

      await submit(student, 'generation').expect(409);
    });
  },
);
