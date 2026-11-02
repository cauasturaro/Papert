# Papert

Plataforma de aprendizado de desenvolvimento de software com Seymour, um tutor de IA.

## Stack

- **Web** — Next.js (Node.js)
- **Core** — NestJS (Node.js) + Prisma + PostgreSQL
- **Seymour** — FastAPI (Python)
- **Infra local** — Docker Compose + Floci (emulação de RDS/AWS)

## Executando localmente

Pré-requisitos: Docker com Compose, Make e OpenSSL.

```sh
make up        # sobe a infraestrutura local (Postgres via RDS emulado, filas, etc.)
make check     # verifica conectividade SQL e extensão pgvector
make down      # para o ambiente sem apagar volumes
```

Com a infra no ar, rode cada app em um terminal separado:

```sh
# Web — porta 3000
cd apps/web && npm ci && npm run dev
```

```sh
# Core — porta 3001
cd apps/core && npm ci --legacy-peer-deps && npm run start:dev
```

```sh
# Seymour — porta 3002
cd apps/seymour
python3.14 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 3002
```

Antes de iniciar o Core, aplique as migrations:

```sh
set -a && . ./.env && set +a
export DATABASE_URL="postgresql://core_user:${CORE_DB_PASSWORD}@localhost:7001/papert?schema=core"
make migrate-core
```

Consulte `apps/core/AUTHENTICATION.md` para configurar segredos e rodar os testes de autenticação.
