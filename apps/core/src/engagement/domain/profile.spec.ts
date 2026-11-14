import { describe, expect, it } from 'vitest';
import { effectiveTimeZone, timeZoneChange } from './profile.js';

const profile = (timeZone: string | null) => ({
  userId: 'learner',
  timeZone,
  currentStreak: 0,
  longestStreak: 0,
  lastStudyDay: null,
});

describe('Profile time zone', () => {
  it('fills an empty profile with the detected browser zone', () => {
    const input = { timeZone: 'America/Sao_Paulo', detected: true };

    expect(timeZoneChange(null, input)).toBe('America/Sao_Paulo');
    expect(timeZoneChange(profile(null), input)).toBe('America/Sao_Paulo');
  });

  it('never lets detection override a stored zone', () => {
    const input = { timeZone: 'Europe/Lisbon', detected: true };

    expect(timeZoneChange(profile('America/Sao_Paulo'), input)).toBeNull();
  });

  it('applies a zone the learner chose, unless it is unchanged', () => {
    const stored = profile('America/Sao_Paulo');

    expect(
      timeZoneChange(stored, { timeZone: 'Europe/Lisbon', detected: false }),
    ).toBe('Europe/Lisbon');
    expect(
      timeZoneChange(stored, {
        timeZone: 'America/Sao_Paulo',
        detected: false,
      }),
    ).toBeNull();
  });

  it('dates activity in UTC until a zone is known', () => {
    expect(effectiveTimeZone(null)).toBe('UTC');
    expect(effectiveTimeZone(profile('Asia/Tokyo'))).toBe('Asia/Tokyo');
  });
});
