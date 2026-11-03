# Papert

Software development learning platform with the Seymour AI tutor.

- [Web](apps/web/README.md): the interface for studying, editing code and chatting with Seymour.
- [Core](apps/core/README.md): the API for authentication, workspaces and execution management.
- [Seymour](apps/seymour/README.md): the AI tutor that reads saved code and provides guidance.
- [Ingestion](apps/ingestion/README.md): turns uploaded PDF, DOC, DOCX and MD sources into searchable passages.
- [Infrastructure](infra/README.md): database, queues, storage and local service setup.
- **Floci**: emulates AWS services locally, including RDS, SQS, S3 and DynamoDB.
- **Langfuse**: the separate self-hosted service for AI traces, token usage and costs.

Requires Docker Compose, Make, OpenSSL and Python 3.
Run commands from the repository root.

## First setup

```sh
make up
```

Add `OPENAI_API_KEY` to the generated `.env`.

## Run everything

```sh
make up-all
```

Builds the applications, applies migrations and starts Web, Core, Seymour,
the execution and ingestion runners, Floci and Langfuse in Docker.

| Service  | URL                   |
| -------- | --------------------- |
| Web      | http://localhost:3000 |
| Core     | http://localhost:3001 |
| Seymour  | http://localhost:3002 |
| Langfuse | http://localhost:3003 |

Langfuse login: `LF_ADMIN_EMAIL` and `LF_ADMIN_PASSWORD` in `.env.langfuse`.

## Stop everything

```sh
make down-all
```

Database and trace volumes are preserved.
