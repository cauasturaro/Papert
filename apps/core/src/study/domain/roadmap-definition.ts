import type { Step } from './study.js';

export function roadmapStructureProblem(steps: Step[]): string[] {
  const problems: string[] = [];
  if (new Set(steps.map((step) => step.id)).size !== steps.length) {
    problems.push('Step IDs must be unique.');
  }

  const earlier = new Set<string>();

  for (const step of steps) {
    const ids = step.challenge.criteria.map((criterion) => criterion.id);

    if (new Set(ids).size !== ids.length) {
      problems.push('Criterion IDs must be unique.');
    }

    // Prerequisites point backwards, so linear progression never meets an unmet one.
    const unmet = (step.requires ?? []).some((id) => !earlier.has(id));

    if (unmet) {
      problems.push('Steps may only require earlier steps.');
    }

    earlier.add(step.id);
  }

  return problems;
}
