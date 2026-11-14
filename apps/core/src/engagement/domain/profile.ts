import { DEFAULT_TIME_ZONE } from './calendar.js';
import type { LearnerProfile } from './engagement.js';

export type TimeZoneInput = { timeZone: string; detected: boolean };

/**
 * The zone to store, or null to keep the current one. A browser's detected zone fills an empty
 * profile only, so it never overrides a zone the learner chose, possibly on another device.
 */
export function timeZoneChange(
  current: LearnerProfile | null,
  input: TimeZoneInput,
) {
  const stored = current?.timeZone ?? null;

  if (input.detected && stored !== null) {
    return null;
  }

  if (stored === input.timeZone) {
    return null;
  }

  return input.timeZone;
}

export function effectiveTimeZone(profile: LearnerProfile | null) {
  return profile?.timeZone ?? DEFAULT_TIME_ZONE;
}

export function hasTimeZone(profile: LearnerProfile | null) {
  return profile?.timeZone != null;
}
