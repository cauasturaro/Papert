PGVECTOR_IMAGE := pgvector/pgvector@sha256:5895949dfcdf308eb0cd31c950c93c14895c77f33fbedfecf1fa511ab1d4bcd2

.PHONY: up check db down logs

up:
	@if [ ! -f .env ]; then \
		password=$$(openssl rand -hex 24) || exit 1; \
		(umask 077; printf 'POSTGRES_PASSWORD=%s\n' "$$password" > .env); \
	fi
	@docker image inspect $(PGVECTOR_IMAGE) >/dev/null 2>&1 || docker pull $(PGVECTOR_IMAGE)
	# shortcut: Floci recognizes numeric PostgreSQL tags; keep this alias until pg18-* tags are supported.
	docker tag $(PGVECTOR_IMAGE) papert-pgvector:18-trixie
	docker compose up -d --wait --wait-timeout 180 floci
	docker compose exec -T floci python3 /setup/ensure-rds.py
	docker compose run --rm -T db -f /setup/init.sql
	$(MAKE) check

check:
	docker compose run --rm -T db -f /setup/check.sql

db:
	docker compose run --rm db

down:
	docker compose down

logs:
	docker compose logs -f floci
