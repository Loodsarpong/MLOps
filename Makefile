# NaturalShea Care ERP — local dev convenience targets.
# `make help` lists everything. Designed for macOS but works on Linux too.

.DEFAULT_GOAL := help
COMPOSE := docker compose -f infra/docker/docker-compose.yml

.PHONY: help setup install db migrate seed api web worker down reset test lint logs

help: ## List the available targets
	@awk 'BEGIN{FS=":.*##";printf "Usage: make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## One-shot: prereq check + .env + start Postgres/Redis/MinIO (macOS-friendly)
	@bash scripts/dev-setup.sh

install: ## Install workspace dependencies (frozen lockfile)
	pnpm install --frozen-lockfile

db: migrate seed ## Migrate then seed (run after `make install`)

migrate: ## Apply DB migrations
	pnpm --filter @ns/api migrate

seed: ## Seed demo tenant + Brendamour Blue Ash DC + roles
	pnpm --filter @ns/api seed

api: ## Run the API in dev mode (http://localhost:4000)
	pnpm --filter @ns/api dev

web: ## Run the Web app in dev mode (http://localhost:3000)
	pnpm --filter @ns/web dev

worker: ## Run the SQS worker locally
	pnpm --filter @ns/api exec ts-node src/workers/main.worker.ts

down: ## Stop docker services (keeps the Postgres volume)
	$(COMPOSE) down

reset: ## DESTRUCTIVE: wipe DB volume, restart services, re-migrate, re-seed
	$(COMPOSE) down -v
	$(COMPOSE) up -d
	@bash -c 'for i in {1..30}; do docker compose -f infra/docker/docker-compose.yml ps --format json postgres | grep -q healthy && break; sleep 2; done'
	$(MAKE) migrate seed

test: ## Run all unit tests
	pnpm -r test

lint: ## Run linters
	pnpm -r lint

logs: ## Tail docker compose logs
	$(COMPOSE) logs -f --tail=200
