# Kawakawa CX - Development Commands

.PHONY: help install dev build test lint lint-fix format format-check knip generate checkpoint db-init db-init-dev db-reset db-reset-mock db-drop db-mock-data db-studio fio-sync clean kill-dev kill-bot kill-api kill-web kill-sync-worker dev-bot dev-sync-worker bot-deploy start stop restart reload status logs search-logs

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	pnpm install

dev: ## Start development servers (API + Web)
	NODE_ENV=development LOG_LEVEL=debug pnpm dev

dev-api: ## Start API dev server only
	NODE_ENV=development LOG_LEVEL=debug pnpm --filter @kawakawa/api dev

dev-web: ## Start Web dev server only
	NODE_ENV=development pnpm --filter @kawakawa/web dev

build: ## Build all packages
	pnpm build

test: ## Run all tests
	pnpm test

lint: ## Check for lint errors
	pnpm lint

lint-fix: ## Fix auto-fixable lint errors
	pnpm lint:fix

format: ## Format all files with Prettier
	pnpm format

format-check: ## Check formatting without modifying
	pnpm format:check

knip: ## Find unused files, dependencies, and exports
	pnpm knip

generate: ## Generate TSOA routes and Drizzle migrations
	pnpm --filter @kawakawa/api tsoa:generate
	pnpm --filter @kawakawa/api db:generate

checkpoint: ## Run full validation: generate, format, lint, build, test
	$(MAKE) generate
	$(MAKE) format
	$(MAKE) lint
	$(MAKE) build
	$(MAKE) test

db-init: ## Initialize database (migrate, seed, sync FIO) - idempotent, production-ready
	pnpm --filter @kawakawa/api db:migrate
	pnpm --filter @kawakawa/api db:init

db-init-dev: ## Initialize database for development (push schema, seed, sync FIO)
	pnpm --filter @kawakawa/api db:push
	pnpm --filter @kawakawa/api db:init
	pnpm --filter @kawakawa/api fio:sync

db-reset: ## Reset database with seed data only (WARNING: deletes all data)
	pnpm --filter @kawakawa/api db:drop
	pnpm --filter @kawakawa/api db:push --force
	pnpm --filter @kawakawa/api fio:sync
	pnpm --filter @kawakawa/api db:seed

db-reset-mock: ## Reset database with mock data (WARNING: deletes all data)
	pnpm --filter @kawakawa/api db:drop
	pnpm --filter @kawakawa/api db:push --force
	pnpm --filter @kawakawa/api fio:sync
	pnpm --filter @kawakawa/api db:seed
	pnpm --filter @kawakawa/api db:mock-data

db-drop: ## Drop all database tables (WARNING: deletes all data)
	pnpm --filter @kawakawa/api db:drop

db-mock-data: ## Load mock data into database (requires seeded DB)
	pnpm --filter @kawakawa/api db:mock-data

db-studio: ## Open Drizzle Studio (visual database browser)
	pnpm --filter @kawakawa/api db:studio

fio-sync: ## Sync FIO data (commodities, locations, stations)
	pnpm --filter @kawakawa/api fio:sync

admin-create: ## Create an administrator user (usage: make admin-create USERNAME="admin" NAME="Admin User")
	@if [ -z "$(USERNAME)" ]; then \
		echo "Error: USERNAME is required"; \
		echo "Usage: make admin-create USERNAME=admin NAME=\"System Administrator\""; \
		exit 1; \
	fi
	pnpm --filter @kawakawa/api admin:create $(USERNAME) $(NAME)

clean: ## Clean build artifacts and node_modules
	rm -rf node_modules apps/*/node_modules packages/*/node_modules
	rm -rf apps/*/dist packages/*/dist
	rm -rf .turbo apps/*/.turbo packages/*/.turbo

kill-dev: ## Kill all running dev servers (tsx, vite, turbo)
	@echo "Killing dev servers..."
	@-pkill -f "tsx watch" 2>/dev/null || true
	@-pkill -f "vite" 2>/dev/null || true
	@-pkill -f "turbo run dev" 2>/dev/null || true
	@echo "Done. Any zombie processes will be cleaned up when VSCode restarts."

kill-bot: ## Kill all running bot processes
	@echo "Killing bot processes..."
	@-pkill -f "@kawakawa/bot" 2>/dev/null || true
	@-pkill -f "apps/bot.*tsx" 2>/dev/null || true
	@-pkill -f "pnpm.*bot dev" 2>/dev/null || true
	@sleep 1
	@echo "Done."

kill-api: ## Kill all running API processes
	@echo "Killing API processes..."
	@-pkill -f "@kawakawa/api" 2>/dev/null || true
	@-pkill -f "apps/api.*tsx" 2>/dev/null || true
	@-pkill -f "pnpm.*api dev" 2>/dev/null || true
	@sleep 1
	@echo "Done."

kill-web: ## Kill all running web processes
	@echo "Killing web processes..."
	@-pkill -f "@kawakawa/web" 2>/dev/null || true
	@-pkill -f "vite" 2>/dev/null || true
	@-pkill -f "pnpm.*web dev" 2>/dev/null || true
	@sleep 1
	@echo "Done."

kill-sync-worker: ## Kill all running sync-worker processes
	@echo "Killing sync-worker processes..."
	@-pkill -f "@kawakawa/sync-worker" 2>/dev/null || true
	@-pkill -f "apps/sync-worker.*tsx" 2>/dev/null || true
	@-pkill -f "pnpm.*sync-worker dev" 2>/dev/null || true
	@sleep 1
	@echo "Done."

dev-bot: ## Start Discord bot dev server with hot reload
	NODE_ENV=development LOG_LEVEL=debug pnpm --filter @kawakawa/bot dev

dev-sync-worker: ## Start FIO sync-worker daemon with hot reload
	NODE_ENV=development LOG_LEVEL=debug pnpm --filter @kawakawa/sync-worker dev

bot-deploy: ## Deploy slash commands to Discord
	pnpm --filter @kawakawa/bot deploy-commands

# Process manager commands (wraps scripts/dev.sh)
start: ## Start dev service(s) in background (usage: make start S=bot)
	@./scripts/dev.sh start $(or $(S),all)

stop: ## Stop dev service(s) (usage: make stop S=bot)
	@./scripts/dev.sh stop $(or $(S),all)

restart: ## Restart dev service(s) (usage: make restart S=bot)
	@./scripts/dev.sh restart $(or $(S),all)

reload: ## Hot-reload a dev service via tsx stdin (usage: make reload S=bot)
	@if [ -z "$(S)" ]; then echo "Usage: make reload S=<service>"; exit 1; fi
	@./scripts/dev.sh reload $(S)

status: ## Show status of dev services
	@./scripts/dev.sh status

logs: ## Tail dev service logs (usage: make logs S=bot)
	@tail -f .dev/logs/$(or $(S),*)*.log

search-logs: ## Search OpenSearch deploy logs (usage: make search-logs ENV=prod, add ERRORS=1, SEARCH="jwt", HOURS=2, COMPONENT=kawa-api)
	pnpm --filter @kawakawa/api logs $(or $(ENV),dev) \
		$(if $(ERRORS),--errors) \
		$(if $(SEARCH),--search "$(SEARCH)") \
		$(if $(HOURS),--hours $(HOURS)) \
		$(if $(COMPONENT),--component $(COMPONENT)) \
		$(if $(LIMIT),--limit $(LIMIT))
