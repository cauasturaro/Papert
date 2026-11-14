import type { ShowcaseRoadmap } from '../showcase-roadmaps.js';

export const reactDataFetchingTanstackQuery: ShowcaseRoadmap = {
  id: 'react-data-fetching-tanstack-query',
  definition: {
    title: 'Server State with React and TanStack Query',
    description:
      'Build a task-list interface whose server state has explicit query identities and mutation behavior. Describe cache invalidation and reversible optimistic updates in React files.',
    level: 'intermediate',
    steps: [
      {
        id: 'define-task-query',
        title: 'Give server data a stable identity',
        content:
          'Server state has a lifecycle outside the component that displays it. A query key identifies one result in the cache, while a query function describes how to obtain it. Include each server-side filter in the key so two lists do not accidentally share incompatible results. Put the QueryClient outside component rendering so a render does not discard the cache. The request boundary should reject unsuccessful HTTP responses instead of treating any decoded JSON as successful data. Keep the fetched task type near that boundary and pass cancellation through to the underlying request where available.',
        concepts: ['query keys', 'QueryClient', 'request cancellation'],
        requires: [],
        challenge: {
          instructions:
            'Implement typed task fetching in src/api.ts and a QueryClientProvider with useQuery in src/tasks.tsx. Include a completion filter in the query key and pass the query signal to fetch.',
          criteria: [
            {
              id: 'query-identity',
              description:
                'src/tasks.tsx creates a stable QueryClient and includes the active completion filter in the task query key.',
            },
            {
              id: 'request-boundary',
              description:
                'src/api.ts checks response.ok, types the task result, and passes AbortSignal to fetch from the query function.',
            },
          ],
        },
      },
      {
        id: 'render-query-states',
        title: 'Make request states understandable',
        content:
          'A list can have no response yet, a failed request, an empty successful response, or useful data. Those states deserve different rendering because they imply different actions for the learner reading the interface. Background refreshing is another state: existing tasks can stay visible while a small indicator explains that newer data is being requested. Use the query status for initial loading and error handling, and the fetching flag for refresh feedback. A retry control should have an accessible label and call the query refetch operation. Avoid replacing a populated list with a full loading screen on every refresh.',
        concepts: [
          'pending states',
          'background refresh',
          'accessible feedback',
        ],
        requires: ['define-task-query'],
        challenge: {
          instructions:
            'Extend src/tasks.tsx with distinct initial pending, initial error, empty, and populated views. Preserve existing tasks during background refresh and add a labeled retry control.',
          criteria: [
            {
              id: 'state-branches',
              description:
                'src/tasks.tsx distinguishes pending, error without data, empty success, and populated success with readable conditional blocks.',
            },
            {
              id: 'refresh-feedback',
              description:
                'src/tasks.tsx keeps cached tasks visible while isFetching, shows refresh feedback, and provides an accessible retry button using refetch.',
            },
          ],
        },
      },
      {
        id: 'invalidate-after-create',
        title: 'Bring cached lists back into agreement',
        content:
          'A mutation changes remote state, but cached queries do not automatically know which results became outdated. After task creation succeeds, invalidate the task-list query family so active filtered lists can request an authoritative view. Keep the mutation request separate from component-local form state. A form should disable repeated submission while its request is pending and explain a failure without erasing the entered title. Clear the input only after confirmed success. This split makes the sequence understandable: submit validated input, change the server, refresh affected server state, then update the local editing experience.',
        concepts: ['mutations', 'cache invalidation', 'form state'],
        requires: ['render-query-states'],
        challenge: {
          instructions:
            'Implement task creation with useMutation in src/use-create-task.ts and a form in src/tasks.tsx. Invalidate all task-list keys on success, disable pending submission, preserve input on failure, and clear it after success.',
          criteria: [
            {
              id: 'mutation-invalidation',
              description:
                'src/use-create-task.ts checks create-response failures and invalidates the task-list query prefix after successful creation.',
            },
            {
              id: 'form-lifecycle',
              description:
                'src/tasks.tsx prevents blank submissions, disables pending submission, retains title text on failure, and clears local input only after success.',
            },
          ],
        },
      },
      {
        id: 'optimistic-rollback',
        title: 'Make speculative state reversible',
        content:
          'An optimistic update lets the interface show an expected change before the server confirms it. That temporary state needs an explicit rollback path. Cancel relevant in-flight queries before taking a cache snapshot so an older response does not overwrite the optimistic value. Record each affected filtered list and update only lists where the new task belongs. Give the temporary task a distinct identity so it cannot collide with a server task. Restore snapshots on failure and invalidate after settlement to reconcile with the server. For this exercise, serialize creation while pending so one rollback cannot erase another concurrent optimistic creation.',
        concepts: ['optimistic updates', 'rollback', 'mutation ordering'],
        requires: ['invalidate-after-create'],
        challenge: {
          instructions:
            'Extend src/use-create-task.ts with cancellation, snapshots for all cached filtered lists, a temporary task, rollback, and settlement invalidation. Keep src/tasks.tsx creation serialized while pending.',
          criteria: [
            {
              id: 'optimistic-snapshot',
              description:
                'onMutate in src/use-create-task.ts cancels task queries, snapshots affected lists, and adds a uniquely identified temporary task only to matching filters.',
            },
            {
              id: 'rollback-reconcile',
              description:
                'onError restores each captured list and onSettled invalidates task lists; src/tasks.tsx prevents overlapping creation submissions.',
            },
          ],
        },
      },
    ],
    starterFiles: {
      'src/api.ts':
        '// TODO: Define typed task requests and response checks.\n',
      'src/tasks.tsx': '// TODO: Provide the query client and task list.\n',
      'src/use-create-task.ts':
        '// TODO: Coordinate creation and optimistic state.\n',
    },
  },
};
