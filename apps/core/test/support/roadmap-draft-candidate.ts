function step(id: string, title: string, requires: string[] = []) {
  return {
    id,
    title,
    content: `Build ${title.toLowerCase()} for the reservation service.`,
    concepts: [title],
    requires,
    challenge: {
      instructions: `Implement ${title.toLowerCase()}.`,
      criteria: [
        { id: `${id}-file`, description: 'The module file exists.' },
        { id: `${id}-export`, description: 'The module exports its port.' },
      ],
    },
  };
}

export function candidate(sourceId: string, foreignSourceId: string) {
  const definition = {
    title: 'Reservations with hexagonal NestJS',
    description: 'A generated path from domain rules to adapters.',
    level: 'intermediate',
    steps: [
      step('domain-rules', 'Domain rules'),
      step('ports', 'Ports', ['domain-rules']),
      step('adapters', 'Adapters', ['ports']),
    ],
    starterFiles: { 'src/reservation.ts': 'export {};\n' },
  };
  const location = { lineStart: 1, lineEnd: 4, headings: ['Conventions'] };

  return {
    definition,
    evidence: [
      { stepId: 'domain-rules', sourceId, cite: 'S1', location },
      // Not admitted with this execution.
      { stepId: 'ports', sourceId: foreignSourceId, cite: 'S2', location },
      // Unknown step.
      { stepId: 'missing', sourceId, cite: 'S1', location },
    ],
  };
}
