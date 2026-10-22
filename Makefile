# Lệnh phát triển thường dùng. Python dùng venv ở gốc repo (.venv).
PY := .venv/bin/python
PG_TEST_PORT ?= 55432
export TEST_DATABASE_URL ?= postgresql+psycopg://bonsai:bonsai@localhost:$(PG_TEST_PORT)/bonsai_test

.PHONY: setup db-dev test test-py test-web up down migrate seed

setup:  ## Cài venv Python + node_modules
	python3.12 -m venv .venv
	.venv/bin/pip install -e "packages/pipeline[all,dev]" -e "apps/api[dev]" -e "apps/worker[dev]"
	cd apps/web && npm install

db-dev:  ## Postgres 16 cho test/dev local (cổng 55432)
	docker start bonsai-pg-dev 2>/dev/null || docker run -d --name bonsai-pg-dev \
		-e POSTGRES_USER=bonsai -e POSTGRES_PASSWORD=bonsai -e POSTGRES_DB=bonsai \
		-p $(PG_TEST_PORT):5432 postgres:16-alpine

test: test-py test-web

test-py:
	cd packages/pipeline && ../../.venv/bin/pytest -q
	cd apps/api && ../../.venv/bin/pytest -q
	cd apps/worker && ../../.venv/bin/pytest -q

test-web:
	cd apps/web && npm run typecheck && npm test

migrate:
	cd apps/api && ../../.venv/bin/alembic upgrade head

seed:
	cd apps/api && ../../$(PY) -m bonsai_api.scripts.seed

COMPOSE := docker compose -f infra/docker-compose.yml --env-file .env

up:  ## Toàn bộ stack (cần .env). Build tuần tự: build song song cùng Dockerfile có thể treo với builder cổ điển.
	$(COMPOSE) build api
	$(COMPOSE) build worker
	$(COMPOSE) build web
	docker tag bonsai-worker bonsai-beat
	docker tag bonsai-api bonsai-s3-init
	$(COMPOSE) up -d --no-build
	docker image prune -f --filter label=bonsai.project=bonsai  # chỉ xóa bản build cũ không tên của bonsai

down:
	$(COMPOSE) down
