import type { ShowcaseRoadmap } from '../showcase-roadmaps.js';

export const typescriptRestApiExpress: ShowcaseRoadmap = {
  id: 'typescript-rest-api-express',
  definition: {
    title: 'Building a REST API with Express and TypeScript',
    description:
      'Write a small task API with explicit routes, input validation, and consistent error responses. Keep task rules separate from Express request handling.',
    level: 'beginner',
    steps: [
      {
        id: 'describe-resource',
        title: 'Define a resource and its operations',
        content:
          'A resource gives an API a stable subject: here it is a task with an identifier, a title, and a completion flag. Route names identify collections and individual tasks, while HTTP methods express the operation. Decide the successful response shape before writing handlers so creation and lookup agree on field names. Keep the task representation independent of Express request objects. An in-memory collection is enough for this exercise; persistence technology would distract from the boundary being practiced. Describe missing-resource behavior alongside the happy path so callers are not left to infer it from implementation details.',
        concepts: ['resources', 'routes', 'representations'],
        requires: [],
        challenge: {
          instructions:
            'Define a Task type and in-memory creation/lookup functions in src/tasks.ts. Document POST /tasks and GET /tasks/:id with success and missing-task examples in docs/api.md.',
          criteria: [
            {
              id: 'task-model',
              description:
                'src/tasks.ts defines identifier, title, and completion fields without importing Express.',
            },
            {
              id: 'route-contract',
              description:
                'docs/api.md specifies POST creation and GET lookup with consistent task fields and an explicit missing-task response.',
            },
          ],
        },
      },
      {
        id: 'validate-boundary',
        title: 'Narrow untrusted input before using it',
        content:
          'TypeScript describes values the program expects, but an incoming JSON body has not earned those expectations. Check that the body is an object and that title is a string before trimming it. Reject blank or overly long titles instead of silently storing values outside the contract. Validation belongs before the function that mutates the task collection. Keep a normalized local value so the accepted title is the same value that gets stored. Client errors should identify the invalid field without echoing an entire request body, which may contain unrelated or sensitive material.',
        concepts: ['runtime validation', 'normalization', 'trust boundaries'],
        requires: ['describe-resource'],
        challenge: {
          instructions:
            'Implement POST /tasks in src/app.ts with JSON body parsing and title validation: a trimmed string of 1 to 120 characters. Pass only validated values to task creation and return HTTP 201.',
          criteria: [
            {
              id: 'title-validation',
              description:
                'src/app.ts rejects null, nonobject bodies, nonstring titles, blank titles, and titles longer than 120 trimmed characters before creation.',
            },
            {
              id: 'created-response',
              description:
                'POST /tasks stores the normalized title, returns HTTP 201 with the created task, and sets a Location header pointing to its task route.',
            },
          ],
        },
      },
      {
        id: 'lookup-status',
        title: 'Distinguish an absent resource from a bad request',
        content:
          'Status codes communicate what happened without requiring a caller to interpret prose. A valid lookup for a task that does not exist is different from a malformed identifier. Define a simple identifier format that matches the creation function and validate the route parameter before searching the collection. Return one response from each branch and stop handler work after sending it. Success should contain the same task representation used by creation. Writing examples for invalid identity and absent identity exposes ambiguous behavior before it spreads into callers or becomes hidden behind a generic failure response.',
        concepts: ['status codes', 'route parameters', 'control flow'],
        requires: ['validate-boundary'],
        challenge: {
          instructions:
            'Implement GET /tasks/:id in src/app.ts. Validate the identifier format chosen in src/tasks.ts, return 400 for malformed ids, 404 for absent tasks, and 200 with the task for a match. Add examples to docs/api.md.',
          criteria: [
            {
              id: 'lookup-branches',
              description:
                'GET /tasks/:id validates its parameter before lookup and uses distinct 400, 404, and 200 branches with explicit returns.',
            },
            {
              id: 'lookup-shape',
              description:
                'The successful GET response matches the creation representation, and docs/api.md includes malformed and absent identifier examples.',
            },
          ],
        },
      },
      {
        id: 'centralize-errors',
        title: 'Finish the boundary with consistent failures',
        content:
          'An error handler is the final translation layer between application failures and HTTP responses. Place it after the routes so errors passed through the middleware chain reach it. A known validation failure can produce a stable public error code; an unexpected exception should produce a generic server response without leaking a stack trace. Malformed JSON is also a boundary failure and deserves a client response rather than an unexplained server error. Keep ordinary missing-resource handling distinct from unexpected exceptions. A single documented envelope lets callers inspect errors without depending on incidental framework messages or internal exception text.',
        concepts: [
          'error middleware',
          'error envelopes',
          'information exposure',
        ],
        requires: ['lookup-status'],
        challenge: {
          instructions:
            'Add final four-argument Express error middleware in src/app.ts. Use a consistent error envelope for validation, missing tasks, malformed JSON, and unexpected failures; document each public code in docs/api.md.',
          criteria: [
            {
              id: 'middleware-placement',
              description:
                'src/app.ts registers four-argument error middleware after routes and maps malformed JSON to HTTP 400.',
            },
            {
              id: 'public-errors',
              description:
                'All error responses share the documented envelope; unexpected errors return HTTP 500 without stack traces or internal exception messages.',
            },
          ],
        },
      },
    ],
    starterFiles: {
      'src/tasks.ts': '// TODO: Model task creation and lookup.\n',
      'src/app.ts': '// TODO: Define Express routes and error handling.\n',
      'docs/api.md':
        '# Task API\n\nTODO: Record request and response examples.\n',
    },
  },
};
