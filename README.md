# Papert

Software development learning platform with the Seymour AI tutor.

**Stack:** Next.js · NestJS + Prisma + PostgreSQL · FastAPI · Docker Compose + Floci

## Prerequisites

Docker with Compose, Make, OpenSSL.

## Local infrastructure

```sh
make up     # start local infrastructure (emulated RDS, queues)
make check  # verify SQL connectivity and pgvector
make down   # stop without removing volumes
```

## Migrations

```sh
set -a && . ./.env && set +a
export DATABASE_URL="postgresql://core_user:${CORE_DB_PASSWORD}@localhost:7001/papert?schema=core"
make migrate-core
```

## Applications

Run each in a separate terminal after infrastructure is up and migrations are applied.

```sh
# Web — port 3000
cd apps/web && npm ci && npm run dev
```

```sh
# Core — port 3001
cd apps/core && npm ci --legacy-peer-deps && npm run start:dev
```

```sh
# Seymour — port 3002
cd apps/seymour
python3.14 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 3002
```

See `apps/core/AUTHENTICATION.md` for auth secrets and test setup.

## Async execution runner

Requires Core and Seymour dependencies, infrastructure up, and migrations applied.
Set `CHAT_QUEUE_URL`, `RESULTS_QUEUE_URL`, `AWS_ENDPOINT_URL`, and `AWS_REGION` in
the Core environment (see `.env.example`). Then, from `apps/core`:

```sh
npm run build
npm run executions:local
```

Runs alongside Core and Web in a separate terminal. Does not start through the Compose `apps` profile.
Override `SEYMOUR_PYTHON` with an absolute interpreter path if the default venv path does not apply.
