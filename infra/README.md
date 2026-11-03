# Infrastructure

Local service setup and shared infrastructure definitions for Papert.

- `floci/`: provisions the local PostgreSQL instance through Floci's RDS emulator.
- `postgres/`: initializes schemas, database permissions and pgvector.
- `shared/`: defines queues, object storage and the session table.
- `langfuse/`: runs a separate Langfuse stack with its own backing services.
- `runner/`: builds the Node.js/Python container for local execution jobs.

`make up-all` starts all services through Docker Compose. Floci emulates AWS resources; Langfuse records AI traces and usage.

See the [project README](../README.md) for setup and start/stop commands.
