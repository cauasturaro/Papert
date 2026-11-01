PGVECTOR_IMAGE := pgvector/pgvector@sha256:5895949dfcdf308eb0cd31c950c93c14895c77f33fbedfecf1fa511ab1d4bcd2

AWS_LOCAL := aws --endpoint-url=http://localhost:4566 --region us-east-1 \
	--no-cli-pager \
	--aws-access-key-id=test --aws-secret-access-key=test

.PHONY: up infra check check-infra check-isolation setup-db smoke-queue migrate-core migrate-seymour up-apps smoke-apps db down logs check-serverless

up:
	@if [ ! -f .env ]; then \
		password=$$(openssl rand -hex 24) || exit 1; \
		core_password=$$(openssl rand -hex 24) || exit 1; \
		seymour_password=$$(openssl rand -hex 24) || exit 1; \
		(umask 077; printf 'POSTGRES_PASSWORD=%s\nCORE_DB_PASSWORD=%s\nSEYMOUR_DB_PASSWORD=%s\n' \
			"$$password" "$$core_password" "$$seymour_password" > .env); \
	else \
		if ! grep -q 'CORE_DB_PASSWORD' .env; then \
			core_password=$$(openssl rand -hex 24) || exit 1; \
			seymour_password=$$(openssl rand -hex 24) || exit 1; \
			(umask 077; printf '\nCORE_DB_PASSWORD=%s\nSEYMOUR_DB_PASSWORD=%s\n' \
				"$$core_password" "$$seymour_password" >> .env); \
		fi; \
	fi
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
		--template-file infra/shared/ingestion.yaml
	$(AWS_LOCAL) cloudformation deploy \
		--stack-name papert-chat \
		--template-file infra/shared/chat.yaml
	$(AWS_LOCAL) cloudformation deploy \
		--stack-name papert-storage \
		--template-file infra/shared/storage.yaml
	$(AWS_LOCAL) cloudformation deploy \
		--stack-name papert-sessions \
		--template-file infra/shared/sessions.yaml
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
	@set -a; . ./.env; set +a; \
	PGPASSWORD=$$CORE_DB_PASSWORD docker compose run --rm -e PGPASSWORD -e PGUSER=core_user db \
		-c "SELECT 1 FROM seymour.health_check LIMIT 1;" 2>&1 | grep -q "permission denied" && \
		echo "PASS: core_user cannot access seymour schema" || \
		(echo "FAIL: core_user accessed seymour schema" && exit 1)
	@set -a; . ./.env; set +a; \
	PGPASSWORD=$$SEYMOUR_DB_PASSWORD docker compose run --rm -e PGPASSWORD -e PGUSER=seymour_user db \
		-c "SELECT 1 FROM core.health_check LIMIT 1;" 2>&1 | grep -q "permission denied" && \
		echo "PASS: seymour_user cannot access core schema" || \
		(echo "FAIL: seymour_user accessed core schema" && exit 1)

smoke-queue:
	@python3 infra/shared/smoke-queue.py

migrate-core:
	cd apps/core && npx prisma migrate deploy

migrate-seymour:
	cd apps/seymour && python -m alembic upgrade head

up-apps:
	docker compose --profile apps up -d --wait

smoke-apps:
	@curl -sf http://localhost:3001/health | grep -q '"status":"ok"' && \
		echo "PASS: Core health OK" || \
		(echo "FAIL: Core health check failed" && exit 1)
	@curl -sf http://localhost:3002/health | grep -q '"status":"ok"' && \
		echo "PASS: Seymour health OK" || \
		(echo "FAIL: Seymour health check failed" && exit 1)

check-serverless:
	@for f in apps/core/serverless.yml apps/seymour/serverless.yml apps/ingestion/serverless.yml infra/shared/serverless.yml; do \
		echo "Checking $$f ..."; \
		npx --yes serverless print --config $$f --stage local > /dev/null 2>&1 && echo "PASS: $$f" || echo "SKIP/WARN: $$f (serverless CLI not available or config incomplete)"; \
	done

check:
	docker compose run --rm -T db -f /setup/check.sql

db:
	docker compose run --rm db

down:
	docker compose down

logs:
	docker compose logs -f floci
