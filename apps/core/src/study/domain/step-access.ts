import { StudyError } from './study.js';
import type { Step } from './study.js';

export function accessibleStep(
  steps: Step[],
  currentStep: number,
  stepId: string,
) {
  const index = steps.findIndex((step) => step.id === stepId);

  if (index < 0) {
    throw new StudyError('not_found', 'Step not found.');
  }

  if (index > currentStep) {
    throw new StudyError('forbidden', 'This step is locked.');
  }

  return steps[index];
}
