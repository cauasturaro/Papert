import { roadmapStructureProblem } from './roadmap-definition.js';
import type { Step } from './study.js';

function step(
  id: string,
  requires: string[] = [],
  criteria = ['criterion'],
): Step {
  return {
    id,
    title: id,
    content: id,
    requires,
    challenge: {
      instructions: id,
      criteria: criteria.map((id) => ({ id, description: id })),
    },
  };
}

it('allows unique steps and criteria with backward prerequisites', () => {
  const steps = [step('first'), step('second', ['first'])];

  const problems = roadmapStructureProblem(steps);

  expect(problems).toEqual([]);
});

it('preserves all structure problems in validation order', () => {
  const steps = [
    step('first', ['second'], ['duplicate', 'duplicate']),
    step('first'),
  ];

  const problems = roadmapStructureProblem(steps);

  expect(problems).toEqual([
    'Step IDs must be unique.',
    'Criterion IDs must be unique.',
    'Steps may only require earlier steps.',
  ]);
});
