import { StudyError } from './study.js';

export function assertAttemptEligible(
  current: { id: string } | undefined,
  stepId: string,
): asserts current is { id: string } {
  if (!current || current.id !== stepId) {
    throw new StudyError(
      'forbidden',
      'Only the current step accepts attempts.',
    );
  }
}
