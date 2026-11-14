import { nextUtcDayStart, utcDayKey, utcDayStart } from './utc-day.js';

describe('UTC day boundaries', () => {
  it('uses the UTC calendar day even when the local offset is another day', () => {
    const lateInBrazil = new Date('2026-11-02T23:30:00-03:00');

    expect(utcDayKey(lateInBrazil)).toBe('2026-11-03');
    expect(utcDayStart(lateInBrazil).toISOString()).toBe(
      '2026-11-03T00:00:00.000Z',
    );
    expect(nextUtcDayStart(lateInBrazil).toISOString()).toBe(
      '2026-11-04T00:00:00.000Z',
    );
  });
});
