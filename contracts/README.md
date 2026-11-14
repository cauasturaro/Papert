# Shared wire contracts

**English** · [Português](README.pt-BR.md)

Examples of every message that crosses a service boundary. Core's Vitest suite and the
`pytest -m unit` suites of Seymour and Ingestion load them directly from this directory, so
producers and consumers are tested against the same files. No generated copy or network
service is needed.

| Directory | Producer → consumer | Boundary exercised |
| --- | --- | --- |
| `execution-job` | Core → Seymour | `SqsExecutionQueue.publish`, `decode_execution`, HTTP `ExecutionEnvelope` |
| `worker-event` | Seymour → Core | `encode_result`, Zod `workerEvent` (progress, failed, completed and all five optional result fields) |
| `execution-claim` | Seymour ↔ Core | `RpcControl.claim`, `workerControl`, `PrismaExecutionLifecycle.claim`; transport/tutor/analysis/generation/recommendation budgets and busy/terminal answers |
| `execution-active` | Seymour ↔ Core | `RpcControl.active`, `workerControl` |
| `execution-failed` | Seymour ↔ Core | `RpcControl.failed`, `workerControl` |
| `execution-sources` | Seymour ↔ Core | `RpcControl.live_sources`, `workerControl` |
| `ingestion-begin` | Ingestion ↔ Core | `begin_request`, `document_answer`, `controlSchema`, `PrismaSourceRepository.begin` |
| `ingestion-complete` | Ingestion ↔ Core | `complete_request`, `completion_answer`, `controlSchema`, `PrismaSourceRepository.complete` |
| `ingestion-fail` | Ingestion ↔ Core | `fail_request`, `completion_answer`, `controlSchema`, `PrismaSourceRepository.fail` |
| `ingestion-removal` | Ingestion ↔ Core | `removal_request`, `removed_answer`, `controlSchema`, `SourceService.control` |
| `ingestion-reindex` | Ingestion ↔ Core | `reindex_request`, `document_answer`, `controlSchema`, `PrismaSourceRepository.reindex` |
| `ingestion-s3` | AWS S3/SQS → Ingestion | `decode_record`: created, removed, ignored and S3 test notifications |
| `ingestion-reindex-event` | Ingestion maintenance CLI/SQS → Ingestion | `reindex.main`, `decode_record` |

## Fixture format

Each `fixtures.json` contains named `valid` and `invalid` cases. Identifiers and values are
synthetic, and they are canonical examples, not defaults.

- Messages use `payload`.
- RPC cases pair `request` with `response`.
- Ingestion event payloads are SQS records, including the JSON-encoded S3 or operator message
  in `body`; `decoded` pins their semantic interpretation.

Producer tests invoke the real builder and compare its complete output with the example.
Consumer tests invoke the real parser and assert its decoded fields. Core's database-backed
builders run with in-memory database doubles, without replacing their wire-building code.
S3 and SQS themselves are external producers and are not invoked by unit tests.

## Rejection policy

Every invalid case names the `service` expected to reject it and the exception class, in
`rejection`. The boundary policy is explicit:

- Core rejects unknown RPC and event fields.
- Seymour rejects unknown job fields.
- Ingestion rejects malformed SQS, S3 and operator envelopes.

Python RPC answer adapters and result serializers do not independently validate untrusted
schema input, and these tests do not pretend they reject cases that only the receiving service
validates. Optional worker result bodies remain opaque here; their separate domain contracts
validate the content.

## Changing a contract

Adding a field:

1. Expand the consumers to accept the new field. Strict consumers must accept an additive
   field explicitly before any producer sends it.
2. Add the shared examples.
3. Update the producers and all consumer and producer tests together.

Renaming a field:

1. Add the replacement field.
2. Migrate producers and consumers, keeping examples for both supported forms.
3. Drain old queued and in-flight messages.
4. Remove the old field.

Never update fixtures merely to silence a failing service: every service that touches the
changed message must pass its tests before the change ships.
