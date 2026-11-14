import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isTimeZone, localDay } from './calendar.js';

describe('Learner calendar', () => {
  it.each(['UTC', 'America/Sao_Paulo', 'Asia/Kolkata', 'Etc/GMT+3'])(
    'accepts the IANA zone %s',
    (zone) => {
      expect(isTimeZone(zone)).toBe(true);
    },
  );

  it.each(['', '+03:00', 'Mars/Olympus', 'America/../UTC', 'x'.repeat(65)])(
    'rejects %j',
    (zone) => {
      expect(isTimeZone(zone)).toBe(false);
    },
  );

  it('dates one instant differently on each side of a day boundary', () => {
    const instant = new Date('2026-11-06T01:30:00Z');

    expect(localDay(instant, 'UTC')).toBe('2026-11-06');
    expect(localDay(instant, 'America/Sao_Paulo')).toBe('2026-11-05');
    expect(localDay(instant, 'Pacific/Kiritimati')).toBe('2026-11-06');
  });

  it('follows daylight saving changes through the runtime zone data', () => {
    const beforeChange = new Date('2026-03-08T07:59:00Z');
    const afterChange = new Date('2026-03-08T08:01:00Z');

    expect(localDay(beforeChange, 'America/Los_Angeles')).toBe('2026-03-07');
    expect(localDay(afterChange, 'America/Los_Angeles')).toBe('2026-03-08');
  });

  it('adds and compares days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');

    expect(daysBetween('2026-12-31', '2027-01-02')).toBe(2);
    expect(daysBetween('2026-11-06', '2026-11-05')).toBe(-1);
  });
});
