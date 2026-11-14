ISOLATION_PSQL ?= docker compose run --rm -T -e PGPASSWORD -e PGUSER db

PGVECTOR_IMAGE := pgvector/pgvector@sha256:5895949dfcdf308eb0cd31c950c93c14895c77f33fbedfecf1fa511ab1d4bcd2

AWS_LOCAL := docker run --rm --network papert-local \
	-e AWS_ACCESS_KEY_ID=test -e AWS_SECRET_ACCESS_KEY=test \
	-v "$(CURDIR)/infra/shared:/templates:ro" \
	amazon/aws-cli:2.31.18@sha256:1a491b258590cc66866cd550f592edff80082f44daf1d903820daeca2f4954de --endpoint-url=http://floci:4566 --region us-east-1 --no-cli-pager

.PHONY: up infra check check-infra check-isolation setup-db smoke-queue ingestion-redrive ingestion-reindex migrate-core migrate-seymour up-apps smoke-apps db down logs check-serverless

up:
	@if [ ! -f .env ]; then \
		password=$$(openssl rand -hex 24) || exit 1; \
		core_password=$$(openssl rand -hex 24) || exit 1; \
		seymour_password=$$(openssl rand -hex 24) || exit 1; \
		(umask 077; printf 'POSTGRES_PASSWORD=%s\nCORE_DB_PASSWORD=%s\nSEYMOUR_DB_PASSWORD=%s\n' \
			"$$password" "$$core_password" "$$seymour_password" > .env); \
	fi
	python3 infra/preflight.py
	$(MAKE) auth-env
	@docker image inspect $(PGVECTOR_IMAGE) >/dev/null 2>&1 || docker pull $(PGVECTOR_IMAGE)
	# shortcut: Floci recognizes numeric PostgreSQL tags; keep this alias until pg18-* tags are supported.
	docker tag $(PGVECTOR_IMAGE) papert-pgvector:18-trixie
	docker compose up -d --wait --wait-timeout 180 floci
	docker compose exec -T floci python3 /setup/ensure-rds.py
	docker compose run --rm -T db -f /setup/init.sql
	$(MAKE) infra
	$(MAKE) setup-db
	$(MAKE) check

infra:
	$(AWS_LOCAL) cloudformation deploy \
		--stack-name papert-ingestion \
		--template-file /templates/ingestion.yaml
	$(AWS_LOCAL) cloudformation deploy \
		--stack-name papert-chat \
		--template-file /templates/chat.yaml
	$(AWS_LOCAL) cloudformation deploy \
		--stack-name papert-storage \
		--template-file /templates/storage.yaml
	$(AWS_LOCAL) cloudformation deploy \
		--stack-name papert-sessions \
		--template-file /templates/sessions.yaml
	@echo "All shared stacks deployed."

check-infra:
	@echo "--- Checking SQS queues ---"
	$(AWS_LOCAL) sqs get-queue-url --queue-name papert-ingestion
	$(AWS_LOCAL) sqs get-queue-url --queue-name papert-ingestion-dlq
	$(AWS_LOCAL) sqs get-queue-url --queue-name papert-chat
	$(AWS_LOCAL) sqs get-queue-url --queue-name papert-chat-dlq
	$(AWS_LOCAL) sqs get-queue-url --queue-name papert-results
	$(AWS_LOCAL) sqs get-queue-url --queue-name papert-results-dlq
	@echo "--- Checking S3 ---"
	$(AWS_LOCAL) s3api head-bucket --bucket papert-sources
	$(AWS_LOCAL) s3api get-bucket-notification-configuration --bucket papert-sources
	$(AWS_LOCAL) s3api get-bucket-cors --bucket papert-sources
	@echo "--- Checking DynamoDB ---"
	$(AWS_LOCAL) dynamodb describe-table --table-name papert-sessions --query "Table.TableStatus"
	@echo "check-infra: all resources available."

setup-db:
	@set -a; . ./.env; set +a; \
	docker compose run --rm -T db \
		-v "ON_ERROR_STOP=1" \
		-v "core_password=$$CORE_DB_PASSWORD" \
		-v "seymour_password=$$SEYMOUR_DB_PASSWORD" \
		-f /setup/setup-schemas.sql

check-isolation:
	@set -a; if [ -f .env ]; then . ./.env; fi; set +a; \
	PGPASSWORD=$$CORE_DB_PASSWORD PGUSER=core_user $(ISOLATION_PSQL) \
		-c "SELECT 1 FROM seymour.health_check LIMIT 1;" 2>&1 | grep -q "permission denied" && \
		echo "PASS: core_user cannot access seymour schema" || \
		(echo "FAIL: core_user accessed seymour schema" && exit 1)
	@set -a; if [ -f .env ]; then . ./.env; fi; set +a; \
	PGPASSWORD=$$SEYMOUR_DB_PASSWORD PGUSER=seymour_user $(ISOLATION_PSQL) \
		-c "SELECT 1 FROM core.health_check LIMIT 1;" 2>&1 | grep -q "permission denied" && \
		echo "PASS: seymour_user cannot access core schema" || \
		(echo "FAIL: seymour_user accessed core schema" && exit 1)

smoke-queue:
	@python3 infra/shared/smoke-queue.py

ingestion-redrive:
	@AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test apps/ingestion/.venv/bin/python infra/ingestion/redrive.py

# Re-extract every finished source after an extraction or chunking change. Core skips
# documents that are still processing, deleted or rejected as uploads.
ingestion-reindex:
	@set -eu; \
	queue=http://floci:4566/000000000000/papert-ingestion; \
	ids=$$(docker compose run --rm -T db -tAc \
		"SELECT id FROM core.source_document WHERE status IN ('ready', 'failed') AND object_version_id IS NOT NULL"); \
	count=0; \
	\
	for id in $$ids; do \
		$(AWS_LOCAL) sqs send-message --queue-url "$$queue" \
			--message-body "{\"PapertReindex\":{\"documentId\":\"$$id\"}}" > /dev/null; \
		count=$$((count + 1)); \
	done; \
	\
	echo "Queued $$count source(s) for reindexing."

migrate-core:
	cd apps/core && npx prisma migrate deploy

migrate-seymour:
	cd apps/seymour && python -m alembic upgrade head

.PHONY: up-all down-all
up-all:
	$(MAKE) up
	$(MAKE) up-apps

APPS_COMPOSE_FILES ?= -f compose.yaml
APPS_COMPOSE = docker compose --env-file .env --env-file .env.langfuse $(APPS_COMPOSE_FILES)

.PHONY: up-observability migrate-apps start-apps
up-observability: langfuse-env
	docker compose --env-file .env.langfuse -f infra/langfuse/compose.yaml -f infra/langfuse/compose.apps.yaml up -d --wait --wait-timeout 180

migrate-apps:
	$(APPS_COMPOSE) build core-migrate seymour-migrate
	$(APPS_COMPOSE) run --rm core-migrate
	$(APPS_COMPOSE) run --rm seymour-migrate

start-apps:
	$(MAKE) up-observability
	$(MAKE) migrate-apps
	$(APPS_COMPOSE) --profile apps up -d --build --wait --wait-timeout 180
	$(MAKE) smoke-apps

up-apps:
	python3 infra/preflight.py
	@set -a; . ./.env; set +a; \
		test -n "$$OPENAI_API_KEY" || (echo "Set OPENAI_API_KEY in .env before make up-apps." && exit 1)
	$(MAKE) start-apps

down-all:
	docker compose --env-file .env.langfuse -f infra/langfuse/compose.yaml -f infra/langfuse/compose.apps.yaml down
	docker compose --profile apps down

smoke-apps:
	@curl -sf http://localhost:3001/health | grep -q '"status":"ok"' && \
		echo "PASS: Core health OK" || \
		(echo "FAIL: Core health check failed" && exit 1)
	@curl -sf http://localhost:3002/health | grep -q '"status":"ok"' && \
		echo "PASS: Seymour health OK" || \
		(echo "FAIL: Seymour health check failed" && exit 1)

check-serverless:
	python3 -m unittest discover -s infra/tests -v
	python3 infra/validate-templates.py

check:
	docker compose run --rm -T db -f /setup/check.sql

db:
	docker compose run --rm db

down:
	docker compose down

logs:
	docker compose logs -f floci

# Generate server-only local secrets once; preserve existing keys and sessions.
.PHONY: auth-env
auth-env:
	@test -f .env || (echo "Run make up first." && exit 1)
	@if ! grep -q '^AUTH_JWE_KEYS=' .env; then \
		key=$$(openssl rand -hex 32) || exit 1; \
		(umask 077; printf "\nAUTH_JWE_ACTIVE_KID=local-v1\nAUTH_JWE_KEYS='{\"local-v1\":\"%s\"}'\n" "$$key" >> .env); \
	fi
	@if ! grep -q '^EDGE_PROXY_SECRET=.' .env; then \
		key=$$(openssl rand -hex 32) || exit 1; \
		(umask 077; printf '\nEDGE_PROXY_SECRET=%s\n' "$$key" >> .env); \
	fi

.PHONY: langfuse langfuse-env
langfuse-env:
	python3 infra/langfuse/setup.py

langfuse: langfuse-env
	docker compose --env-file .env.langfuse -f infra/langfuse/compose.yaml up -d

# No-key demo: the same stack as up-apps, with Seymour's deterministic fake model.
.PHONY: demo up-demo
demo:
	$(MAKE) up
	$(MAKE) up-demo

up-demo:
	python3 infra/preflight.py
	$(MAKE) start-apps APPS_COMPOSE_FILES='-f compose.yaml -f compose.fake.yaml'

# Browser end-to-end tests against a disposable fake-model stack in its own Compose project.
# E2E_KEEP=1 leaves the stack running after the tests for debugging.
E2E_WEB_PORT ?= 3100
export E2E_WEB_PORT
E2E_COMPOSE := docker compose --env-file .env.e2e -p papert-e2e -f compose.yaml -f compose.fake.yaml -f compose.e2e.yaml

.PHONY: e2e e2e-env e2e-up e2e-test e2e-logs e2e-down
e2e:
	@$(MAKE) e2e-up && $(MAKE) e2e-test; status=$$?; \
	if [ -z "$(E2E_KEEP)" ]; then $(MAKE) e2e-down; fi; \
	exit $$status

# Throwaway credentials, separate from the development .env.
e2e-env:
	@if [ ! -f .env.e2e ]; then \
		password=$$(openssl rand -hex 24) || exit 1; \
		core_password=$$(openssl rand -hex 24) || exit 1; \
		seymour_password=$$(openssl rand -hex 24) || exit 1; \
		key=$$(openssl rand -hex 32) || exit 1; \
		(umask 077; printf "POSTGRES_PASSWORD=%s\nCORE_DB_PASSWORD=%s\nSEYMOUR_DB_PASSWORD=%s\nAUTH_JWE_ACTIVE_KID=e2e-v1\nAUTH_JWE_KEYS='{\"e2e-v1\":\"%s\"}'\n" \
			"$$password" "$$core_password" "$$seymour_password" "$$key" > .env.e2e); \
	fi
	@if ! grep -q '^EDGE_PROXY_SECRET=.' .env.e2e; then \
		key=$$(openssl rand -hex 32) || exit 1; \
		(umask 077; printf '\nEDGE_PROXY_SECRET=%s\n' "$$key" >> .env.e2e); \
	fi

e2e-up: e2e-env
	$(E2E_COMPOSE) up -d --wait --wait-timeout 180 postgres floci
	@set -a; . ./.env.e2e; set +a; \
	$(E2E_COMPOSE) run --rm -T db \
		-v "core_password=$$CORE_DB_PASSWORD" \
		-v "seymour_password=$$SEYMOUR_DB_PASSWORD" \
		-f /setup/setup-schemas.sql
	$(E2E_COMPOSE) run --rm -T aws-setup
	$(E2E_COMPOSE) build core-migrate seymour-migrate
	$(E2E_COMPOSE) run --rm core-migrate
	$(E2E_COMPOSE) run --rm seymour-migrate
	$(E2E_COMPOSE) --profile apps up -d --build --wait --wait-timeout 300

e2e-test:
	cd apps/web && E2E_BASE_URL=http://localhost:$(E2E_WEB_PORT) npx playwright test

e2e-logs:
	$(E2E_COMPOSE) --profile apps logs --no-color

e2e-down:
	$(E2E_COMPOSE) --profile apps --profile tools down -v --remove-orphans
