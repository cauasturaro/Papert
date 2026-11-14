import type { ShowcaseRoadmap } from '../showcase-roadmaps.js';

export const hexagonalArchitectureNestjs: ShowcaseRoadmap = {
  id: 'hexagonal-architecture-nestjs',
  definition: {
    title: 'Hexagonal Architecture with NestJS',
    description:
      'Design a reservation service with a framework-independent core, explicit ports, and NestJS adapters. Make dependency direction visible across workspace files.',
    level: 'intermediate',
    steps: [
      {
        id: 'model-reservation',
        title: 'Keep the rule inside the domain',
        content:
          'A reservation occupies a positive number of seats for a named workshop. That rule belongs to the domain even when a request arrives through HTTP. Begin with values and behavior that can be understood without NestJS decorators, database records, or transport status codes. Decide what makes an invalid reservation impossible to construct, and give failures names that describe the rule being broken. A small domain model is enough here. Separating this decision now prevents later adapters from becoming alternate sources of truth when another entry point is added.',
        concepts: ['domain rules', 'dependency direction'],
        requires: [],
        challenge: {
          instructions:
            'Implement reservation construction in src/domain/reservation.ts. Require a nonempty workshop identifier and a positive integer seat count; represent invalid requests with a named domain error.',
          criteria: [
            {
              id: 'domain-validation',
              description:
                'src/domain/reservation.ts rejects empty workshop identifiers, noninteger seats, and seats below one.',
            },
            {
              id: 'framework-free',
              description:
                'src/domain/reservation.ts imports no NestJS or persistence modules and defines a named rule error.',
            },
          ],
        },
      },
      {
        id: 'define-ports',
        title: 'Describe what the use case needs',
        content:
          'An application use case coordinates work without choosing how storage works. Its outgoing port describes the operations it needs in domain terms, while its input describes the action offered to callers. Define a reservation repository contract close to the use case instead of exposing a database client through it. TypeScript interfaces disappear at runtime, so a later NestJS provider will need a separate injection token. Keep creation of the domain object ahead of persistence. This ordering makes the rule visible and prevents an adapter from saving an invalid reservation first.',
        concepts: ['ports', 'use cases', 'injection tokens'],
        requires: ['model-reservation'],
        challenge: {
          instructions:
            'Add a repository interface and an injected Reserve use case in src/application/reserve.ts. Construct a valid reservation before saving it and return the saved reservation identifier.',
          criteria: [
            {
              id: 'repository-port',
              description:
                'src/application/reserve.ts defines a repository contract using domain values rather than ORM types.',
            },
            {
              id: 'use-case-order',
              description:
                'The Reserve use case validates through the domain model before calling the injected repository and returns its identifier.',
            },
          ],
        },
      },
      {
        id: 'adapt-storage',
        title: 'Put storage behind the port',
        content:
          'An adapter translates a technology into the vocabulary of a port. For this workspace, a memory adapter is sufficient to show that the use case does not care where reservations live. Keep the stored collection private and make identifier creation explicit so examples remain understandable. The adapter implements the contract; the contract must not import the adapter. A second implementation could later use SQL without changing the reservation rule. Think carefully about mutable references: returning the same stored object lets a caller silently change storage outside the repository boundary.',
        concepts: ['adapters', 'encapsulation', 'substitutability'],
        requires: ['define-ports'],
        challenge: {
          instructions:
            'Create src/infrastructure/memory-reservations.ts implementing the repository port. Keep storage private, generate distinct identifiers, and avoid exposing mutable stored references.',
          criteria: [
            {
              id: 'port-implementation',
              description:
                'src/infrastructure/memory-reservations.ts implements the repository interface with matching method signatures.',
            },
            {
              id: 'storage-boundary',
              description:
                'The memory adapter keeps its collection private, assigns distinct identifiers, and copies mutable values at its boundary.',
            },
          ],
        },
      },
      {
        id: 'wire-nest',
        title: 'Connect the framework at the edge',
        content:
          'NestJS can assemble dependencies without owning the business rule. A module is the composition point where an injection token is bound to an adapter and a factory receives that dependency to construct the use case. The controller handles transport details such as request shape and response status. Translate a known domain error into a client response, but do not disguise every unexpected failure as bad input. Reading the imports should reveal an inward dependency direction: infrastructure knows the application and domain, while neither inner layer needs the controller or module.',
        concepts: ['composition root', 'HTTP adapters', 'error translation'],
        requires: ['adapt-storage'],
        challenge: {
          instructions:
            'Complete src/infrastructure/reservations.module.ts and create src/infrastructure/reservations.controller.ts. Bind a repository token, construct Reserve through a provider factory, and expose POST /reservations with domain-error translation.',
          criteria: [
            {
              id: 'provider-wiring',
              description:
                'reservations.module.ts binds the repository token to the memory adapter and injects it into a Reserve factory provider.',
            },
            {
              id: 'controller-boundary',
              description:
                'reservations.controller.ts delegates to Reserve, uses HTTP 201 for success, and maps the known domain error to HTTP 400 without swallowing unexpected errors.',
            },
          ],
        },
      },
    ],
    starterFiles: {
      'src/domain/reservation.ts': '// TODO: Model reservation rules.\n',
      'src/application/reserve.ts':
        '// TODO: Define the use case and its ports.\n',
      'src/infrastructure/reservations.module.ts':
        '// TODO: Wire adapters with NestJS providers.\n',
    },
  },
};
