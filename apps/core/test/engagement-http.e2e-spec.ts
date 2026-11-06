import { engagementHarness } from './support/engagement.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)('Engagement HTTP', () => {
  const context = engagementHarness();

  it('rejects client counters, achievement writes, missing sessions and cross-origin writes', async () => {
    const learner = await context.student();
    const forgedCounters = { timeZone: 'UTC', currentStreak: 99 };

    await context
      .api('put', '/engagement/time-zone', learner.cookie)
      .send(forgedCounters)
      .expect(400);
    await context
      .api('post', '/engagement/achievements', learner.cookie)
      .send({})
      .expect(404);
    await context
      .api('put', '/engagement', learner.cookie)
      .send({})
      .expect(404);
    await context.api('get', '/engagement', '').expect(401);
    await context
      .api('put', '/engagement/time-zone', learner.cookie)
      .set('Origin', 'https://attacker.example')
      .send({ timeZone: 'UTC' })
      .expect(403);

    expect(
      await context.db.learnerProfile.findUnique({
        where: { userId: learner.userId },
      }),
    ).toBeNull();
  });

  it('detects a zone once, allows explicit replacement and rejects offsets', async () => {
    const learner = await context.student();

    const detected = await context
      .api('put', '/engagement/time-zone', learner.cookie)
      .send({ timeZone: 'America/Sao_Paulo', detected: true })
      .expect(200);
    const ignored = await context
      .api('put', '/engagement/time-zone', learner.cookie)
      .send({ timeZone: 'Asia/Tokyo', detected: true })
      .expect(200);
    const explicit = await context
      .api('put', '/engagement/time-zone', learner.cookie)
      .send({ timeZone: 'Asia/Tokyo' })
      .expect(200);

    expect(detected.body).toMatchObject({
      timeZone: 'America/Sao_Paulo',
      timeZoneSet: true,
    });
    expect(ignored.body.timeZone).toBe('America/Sao_Paulo');
    expect(explicit.body.timeZone).toBe('Asia/Tokyo');

    await context
      .api('put', '/engagement/time-zone', learner.cookie)
      .send({ timeZone: '+03:00' })
      .expect(400);

    const view = await context
      .api('get', '/engagement', learner.cookie)
      .expect(200);

    expect(view.body.timeZone).toBe('Asia/Tokyo');
  });
});
