import type { RoadmapDefinition } from './study.js';

export const DEFAULT_ROADMAP_ID = 'http-service-foundations';

export const defaultRoadmapDefinition: RoadmapDefinition = {
  title: 'Build a small HTTP service',
  description:
    'A practice roadmap for learning request validation and separating business rules from HTTP.',
  starterFiles: { 'src/service.ts': '// Write your service here.\n' },
  steps: [
    {
      id: 'validate-input',
      title: 'Validate the request',
      content:
        'HTTP input is untrusted. Validate the request before calling business logic and return a clear error for invalid input.',
      challenge: {
        instructions:
          'Design a POST /greetings endpoint that accepts a non-empty name and returns a greeting. Describe how invalid requests are handled.',
        criteria: [
          {
            id: 'valid-name',
            description:
              'Accept a non-empty string name and reject missing, empty or non-string values.',
          },
          {
            id: 'http-errors',
            description:
              'Return HTTP 400 for invalid input without exposing internal details.',
          },
          {
            id: 'greeting',
            description: 'Return a greeting containing the validated name.',
          },
        ],
      },
    },
    {
      id: 'separate-rules',
      title: 'Separate business rules',
      content:
        'Keep greeting construction independent of the HTTP framework so it can be tested directly.',
      challenge: {
        instructions:
          'Extract greeting construction into a pure function and keep request validation at the HTTP boundary.',
        criteria: [
          {
            id: 'pure-function',
            description:
              'Build greetings without HTTP dependencies or side effects.',
          },
          {
            id: 'boundary-validation',
            description:
              'Keep validation and status codes at the HTTP boundary.',
          },
        ],
      },
    },
  ],
};
