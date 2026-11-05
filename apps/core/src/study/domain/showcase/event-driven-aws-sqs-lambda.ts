import type { ShowcaseRoadmap } from '../showcase-roadmaps.js';

export const eventDrivenAwsSqsLambda: ShowcaseRoadmap = {
  id: 'event-driven-aws-sqs-lambda',
  definition: {
    title: 'Reliable Event Processing with SQS and Lambda',
    description:
      'Design a queue-backed parcel event processor with explicit duplicate handling and failure recovery. Connect handler code to a least-privilege infrastructure template.',
    level: 'advanced',
    steps: [
      {
        id: 'validate-envelope',
        title: 'Treat each message as an independent input',
        content:
          'A queue delivers serialized messages, and a batch can contain both valid and invalid records. Define a small event envelope with an event identifier, a version, and a parcel identifier before implementing the handler. JSON parsing is only the first check: a parsed value can still have the wrong type or an unsupported version. Preserve the queue message identifier separately from the event identifier because retry reporting and business deduplication use different identities. Keep validation ahead of any business effect. A malformed record must not cause later valid records in the same batch to be silently skipped.',
        concepts: ['event envelopes', 'batch processing', 'validation'],
        requires: [],
        challenge: {
          instructions:
            'Define a versioned ParcelReady event validator in src/process-event.ts. Implement src/handler.ts to inspect every SQS record independently and retain both messageId and validated eventId.',
          criteria: [
            {
              id: 'event-validation',
              description:
                'src/process-event.ts rejects malformed JSON, missing event or parcel identifiers, and unsupported event versions before effects.',
            },
            {
              id: 'batch-isolation',
              description:
                'src/handler.ts handles each record independently and keeps SQS messageId separate from business eventId.',
            },
          ],
        },
      },
      {
        id: 'make-effects-idempotent',
        title: 'Protect effects across duplicate delivery',
        content:
          'Queue delivery can repeat a message after a timeout or acknowledgement failure. Idempotency means repeating the same logical event does not repeat its business effect. A separate check followed by a write is unsafe because two workers can pass the check together. For this exercise, keep the parcel status change and a processed-event marker in one DynamoDB transaction, with a conditional marker insertion. A committed duplicate can be treated as successful, while unrelated transaction failures must remain failures. This design bounds the guarantee to data inside that transaction; an external shipment purchase would need a different coordination strategy.',
        concepts: ['idempotency', 'atomic writes', 'DynamoDB transactions'],
        requires: ['validate-envelope'],
        challenge: {
          instructions:
            'Implement src/process-event.ts with an injected transactional store that atomically inserts a conditional processed-event marker and updates parcel status. Document the guarantee and its external-effect limit in docs/recovery.md.',
          criteria: [
            {
              id: 'atomic-deduplication',
              description:
                'src/process-event.ts commits the event marker and parcel update in one transaction with an eventId uniqueness condition rather than a check-then-write sequence.',
            },
            {
              id: 'duplicate-classification',
              description:
                'Only the store outcome identifying an existing processed-event marker is treated as duplicate success; unrelated failures propagate, and docs/recovery.md limits the guarantee to transactional data.',
            },
          ],
        },
      },
      {
        id: 'report-retryable-records',
        title: 'Retry failures without repeating successful records',
        content:
          'A batch-level exception can cause successful records to be delivered again alongside a failing record. Partial batch responses let the handler identify only records that still need processing. Collect failed queue message identifiers while allowing independent successes to finish. A duplicate already committed by the previous step counts as success and should not appear in the failure list. For a standard queue, this per-record approach avoids unnecessary replay without promising ordering. Document how malformed messages and temporary storage failures eventually reach the dead-letter queue, and avoid catching a storage outage merely to acknowledge the affected event as successful.',
        concepts: ['partial batch responses', 'retries', 'dead-letter queues'],
        requires: ['make-effects-idempotent'],
        challenge: {
          instructions:
            'Complete src/handler.ts to return batchItemFailures containing failed messageIds for a standard queue. Add written examples of mixed success, duplicate success, invalid input, and transient storage failure in docs/recovery.md.',
          criteria: [
            {
              id: 'failure-identifiers',
              description:
                'src/handler.ts returns batchItemFailures entries with itemIdentifier equal to each failed SQS messageId and excludes successful or committed duplicate records.',
            },
            {
              id: 'retry-examples',
              description:
                'docs/recovery.md traces mixed batches, duplicates, malformed messages, and storage outages, showing which records retry and explaining eventual dead-letter handling.',
            },
          ],
        },
      },
      {
        id: 'declare-infrastructure',
        title: 'Make recovery settings part of the template',
        content:
          'Infrastructure determines whether the handler contract is actually honored. Enable partial batch reporting on the event source mapping and give the source queue a redrive policy pointing to a dead-letter queue. The visibility timeout must leave enough room for the function timeout and batching delay, or the same record may reappear while processing continues. Declare the transactional tables and restrict the function role to the queue and table actions it needs. Recovery also needs an operator decision: inspect the failure cause, correct it, and redrive deliberately while keeping idempotency markers long enough to cover the replay window.',
        concepts: [
          'infrastructure as code',
          'least privilege',
          'redrive policy',
        ],
        requires: ['report-retryable-records'],
        challenge: {
          instructions:
            'Complete template.yaml with a standard SQS queue, DLQ, Lambda mapping with ReportBatchItemFailures, transactional tables, and scoped role permissions. Set explicit timeout and retention values and justify their relationship and redrive procedure in docs/recovery.md.',
          criteria: [
            {
              id: 'queue-configuration',
              description:
                'template.yaml connects a DLQ through RedrivePolicy, enables ReportBatchItemFailures, and declares visibility timeout at least six times the function timeout plus the batching window.',
            },
            {
              id: 'scoped-resources',
              description:
                'template.yaml declares parcel and processed-event tables and scopes queue-consumer and transactional table permissions to their resource ARNs.',
            },
            {
              id: 'recovery-window',
              description:
                'docs/recovery.md explains timeout choices, longer DLQ retention, marker retention covering the replay window, and inspection before deliberate redrive.',
            },
          ],
        },
      },
    ],
    starterFiles: {
      'src/handler.ts':
        '// TODO: Process queue records and report individual failures.\n',
      'src/process-event.ts':
        '// TODO: Validate events and make effects idempotent.\n',
      'template.yaml':
        '# TODO: Describe queue, dead-letter queue, function, and permissions.\n',
      'docs/recovery.md':
        '# Event recovery\n\nTODO: Explain retry and redrive choices.\n',
    },
  },
};
