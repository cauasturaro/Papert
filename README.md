# Papert

A software development learning platform with Seymour, an AI tutor.

## Local infrastructure

Prerequisites: Docker with Compose, Make, and OpenSSL. Start Docker Desktop or OrbStack before running commands from the repository root.

```sh
make up
```

This command generates `.env` with a random local password when the file is absent, prepares the pgvector image, starts Floci, creates PostgreSQL through emulated RDS if needed, and enables and checks the `vector` extension. AWS CLI and PostgreSQL do not need to be installed on the host. The first run downloads images; subsequent runs preserve the instance and its data.

Images are pinned by digest. The local `papert-pgvector:18-trixie` tag works around Floci's PostgreSQL version detection. Floci accesses the Docker socket to manage RDS containers and, later, Lambda containers.

| Access | Address |
| --- | --- |
| Emulated AWS APIs from the host | `http://localhost:4566` |
| Emulated AWS APIs from containers on `papert-local` | `http://floci:4566` |
| PostgreSQL from the host | `localhost:7001` |
| PostgreSQL from containers | `floci:7001` |
| Database / local administrative user | `papert` / `papert_admin` |

```sh
make check  # Check SQL connectivity and vector distance
make db     # Open psql against local RDS; enter \q to exit
make logs   # Follow Floci logs; Ctrl+C stops following
make down   # Stop the environment without deleting volumes
```

The previous PostgreSQL service remains under the `legacy` profile with its volume preserved. Start it explicitly with `docker compose --profile legacy up -d postgres` (port `5432`). It is no longer required for the default setup.

Keep `.env`: changing its password does not change the password of an existing database. `.env.example` documents the variable without containing credentials. Do not use `docker compose down -v` or manually remove volumes to resolve errors: this can delete data.

## Applications

Run each application in its own terminal:

```sh
# Web — Node.js and npm
cd apps/web
npm ci
npm run dev
```

```sh
# Core — Node.js and npm
cd apps/core
npm ci --legacy-peer-deps
# Load the root environment and apply migrations first — see Authentication below.
npm run start:dev
```

```sh
# Seymour — Python 3.14
cd apps/seymour
python3.14 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 3002
```

Web uses port `3000`; Core uses `3001`; Seymour responds at `http://localhost:3002/health`. Ingestion currently has only its Python environment prepared.

Local infrastructure includes Floci/RDS, isolated service schemas, queues, storage and the sessions table. Application hosting and Lambda integration remain under development.

## Authentication

Core now provides registration, login, renewable JWE sessions, ownership checks and logout. The Web account flow is at `/account`. Follow [authentication setup and policy](apps/core/AUTHENTICATION.md) to load the root environment, migrate the database, configure secrets and run tests. `make auth-env` prepares a missing local JWE key without replacing existing material.

## Study workspaces

After signing in at `/account`, open `/study` to start or resume the practice roadmap, view its author and challenge criteria, save notes and inspect attempt history. Roadmap definitions remain immutable; each student's files, notes and progress are private. File editing and AI evaluation are not available yet.

Apply the current Core migrations against local RDS before starting the applications:

```sh
set -a
. ./.env
set +a
export DATABASE_URL="postgresql://core_user:${CORE_DB_PASSWORD}@localhost:7001/papert?schema=core"
make migrate-core
```
