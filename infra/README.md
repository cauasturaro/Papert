# Infrastructure

**English** · [Português](README.pt-BR.md)

Everything needed to run Papert locally, plus the AWS stack definitions.

| Path | Contents |
| --- | --- |
| `shared/` | CloudFormation templates for queues, storage and the sessions table, and the shared Serverless stack |
| `postgres/` | Schema and role setup, and the isolation checks |
| `floci/` | Provisioning of the emulated RDS instance |
| `runner/` | Image of the local queue runners that stand in for the Lambda triggers |
| `ingress/` | Nginx configuration in front of Web |
| `langfuse/` | Self-hosted Langfuse stack |
| `ingestion/` | Dead-letter queue redrive tool |
| `tests/` | Offline contracts over the templates and Compose files |

## Local stack

Requirements: Docker Engine with Compose v2, Python 3 and OpenSSL. Allow at least 8 GB of
Docker memory.

| Command | Result |
| --- | --- |
| `make up` | Creates the database and the emulated AWS resources |
| `make up-all` | Adds Core, Web, Seymour, the queue runners and Langfuse |
| `make demo` | The same stack on Seymour's deterministic fake model, with no API key |
| `make down-all` | Stops the stacks and keeps the volumes |

Open http://localhost:3000 after startup and register an account. Langfuse runs at
http://localhost:3003; its generated administrator credentials are in `.env.langfuse`.

## Credentials

`make up` and `make langfuse-env` generate the credentials. The environment examples are
references, not files to copy. Keep the generated files at mode 0600.

- Add `OPENAI_API_KEY` to `.env` before running the queue workers.
- Setup rejects blank credentials in an existing file and never rotates them. Restore the
  credentials that belong to the existing volumes.
- For a new installation only, remove the copied environment file and run setup again.
- Never remove a populated volume to repair a blank template.
- `make auth-env` and `make e2e-env` generate the server-only `EDGE_PROXY_SECRET` without
  replacing existing credentials.

## Network

Only the Nginx ingress publishes Web's port. It replaces client-written forwarding headers
with its socket peer, so Next is reachable only inside the Compose network. Core stays
published on loopback for debugging. The end-to-end stack publishes its own ingress at
`127.0.0.1:3100`.

## Operations

| Command | Purpose |
| --- | --- |
| `make up-apps` | Builds the migration images, runs the Core and then the Seymour migrations, and starts the applications. Restarting an API does not migrate |
| `make smoke-apps` | Requires healthy database responses from both APIs |
| `make check-isolation` | Verifies that each database role is denied access to the other service's schema |
| `make smoke-queue` | Verifies message identity after a redrive on disposable queues. Needs boto3 on the host |
| `make ingestion-redrive` | Replays the ingestion dead-letter queue once the cause of failure is corrected |
| `make check-serverless` | Runs the offline template contracts and CloudFormation lint |

`make check-serverless` needs `python -m pip install -r infra/requirements-checks.txt` first.
It does not prove that a cloud deployment succeeds.

Removing volumes is a destructive reset, not a normal shutdown.

## AWS

The stacks have never been deployed. They provision the queues, S3, DynamoDB and the
application Lambdas and APIs, and leave PostgreSQL, networking, Web hosting and alert
delivery to the operator.

- [AWS deployment](../docs/deployment.md): prerequisites, release order, edge trust and
  migrations.
- [Operations](../docs/operations.md): limits, monitoring, retention, recovery and teardown.
