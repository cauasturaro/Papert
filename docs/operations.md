# Operations

Limits, monitoring, retention and recovery for a deployed stage, and the maintenance
procedures of the ingestion worker. Day-to-day local commands are in the
[infrastructure guide](../infra/README.md).

## Concurrency

| Limit | Value |
| --- | --- |
| Chat, results and ingestion event mappings | 2 concurrent invocations each |
| Core HTTP API | 4 reserved |
| Maintenance and control functions | Separate small ceilings |
| API Gateway | 10 requests per second, burst of 20 |

These are demo limits, not a measured capacity claim. Budget database connections across all
Lambda pools and leave room for migrations. Before raising concurrency, confirm the provider
rate limits and the database connection count under a burst.

## Monitoring

- Cloud logs are retained for 14 days.
- SNS alarms fire on worker errors and throttles, API 5xx responses, and sustained p95 API
  latency above one second.
- A shared dashboard shows queue age and dead-letter queue depth. Queue-age alarms fire after
  five minutes; dead-letter alarms fire on any visible message.

Start a diagnosis from the affected queue, the CloudWatch worker errors and the execution or
document ID. Correct the failure, then replay only the messages that are understood.

An initial operating objective is more than 99% of accepted API requests succeeding and p95
latency below one second, excluding asynchronous model work. These are targets and have not
been measured.

## Retention

| Data | Retention |
| --- | --- |
| Source buckets | Retained on stack deletion or replacement, including object versions |
| Session and checkpoint items in DynamoDB | Disposable; expire through TTL, which removes items asynchronously |
| Source queues | 4 days |
| Dead-letter queues | 14 days |
| Database backups | Configured on the external database; at least seven days of recovery history for a demo |

## Restore

Run a restore exercise before launch: restore into a separate database, apply and verify the
migrations, check schema isolation and source references, and validate the application before
switching URLs. No restore exercise has been performed by this repository's static checks.

## Teardown and cost

To destroy a demo, stop the workers and remove the application stacks before the shared
infrastructure. Inventory and back up the retained S3 versions and the external database
before deleting them explicitly.

The database, NAT, Langfuse backing services, retained S3 versions and logs can incur costs
while the applications are idle. Set an AWS budget before deploying and review the region's
current pricing. There is no fixed monthly cost claim and no automated production release.

## Dead-letter queues

Working with a dead-letter queue: stop the ingestion runner during diagnosis, inspect and
preserve the failed messages before replaying, and never purge the queue.

`source_message_failed` logs contain message ID, receive count, stage and error
class, without the body or learner text. Inspect those logs before reading a
DLQ record through restricted operator tooling. Fix malformed producer payloads,
provider failures or configuration, then redrive only the affected messages.
Preserve SQS message identity for normal retries. A manually redriven reindex
with a new message ID is a new paid reindex operation. Do not publish message
bodies in logs or incident tickets.

## Changing the embedding space

Index compatibility includes the exact embedding model, 1,536 dimensions and
pipeline revision `2` (text extraction and chunking). Retrieval excludes older
revisions and incompatible models, including following chunks. Use a maintenance
window when changing the model or pipeline revision:

1. Pause tutor traffic and uploads; drain current ingestion jobs.
2. Apply Seymour migrations, then deploy Core and the ingestion worker with the
   chosen `EMBEDDING_MODEL`.
3. From `apps/ingestion`, run `python -m src.infrastructure.reindex` to inventory
   incompatible indexed sources using `SEYMOUR_DATABASE_URL`. Add
   `--queue-url <ingestion-queue-url>` to enqueue them with the configured AWS
   credentials and region. Core checks that each source is still live.
4. Wait for the queue to drain, inspect failures/DLQ and run the inventory again.
   Successfully migrated sources disappear from the inventory, so interrupted
   maintenance can resume. Avoid enqueueing another inventory while jobs remain
   active. Sources that never reached the vector store need a separate Core
   inventory; this command only covers previously recorded indexes.
5. Deploy Seymour with the same model and resume traffic once inventory is empty.

The worker serializes paid work per document with a PostgreSQL session advisory
lock; use a direct connection or session pooling, not transaction pooling. A
committed index stores completion statistics and the SQS reindex message ID so
redelivery retries Core completion without embedding again. A later failed
embedding batch still requires embedding the document again on retry.

Extraction runs in a child process with a 60-second ceiling. Lambda remaining
time also bounds extraction and embedding calls, reserving ten seconds for
persistence and failure reporting. Size function and queue timeouts together;
this does not checkpoint embedding batches across invocations.
