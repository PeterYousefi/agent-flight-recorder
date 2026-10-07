.PHONY: setup dev test test-unit test-integration lint format typecheck demo down clean migrate build help

# Default target
help:
	@echo ""
	@echo "Agent Flight Recorder — Available commands"
	@echo ""
	@echo "  make setup              Install all dependencies"
	@echo "  make dev                Start API, worker, and web in development mode"
	@echo "  make test               Run all tests"
	@echo "  make test-unit          Run unit tests only (no Docker required)"
	@echo "  make test-integration   Run integration tests (requires docker compose up -d)"
	@echo "  make lint               Run ESLint across all packages"
	@echo "  make format             Run Prettier formatter"
	@echo "  make format-check       Check formatting without writing"
	@echo "  make typecheck          Run TypeScript compiler check across all packages"
	@echo "  make migrate            Run Prisma database migrations"
	@echo "  make demo               Seed demo data and run scripted demonstration"
	@echo "  make down               Stop all Docker services"
	@echo "  make clean              Remove build artifacts and node_modules"
	@echo "  make build              Build all packages"
	@echo ""

# ─────────────────────────────────────────────
# Setup
# ─────────────────────────────────────────────
setup:
	@echo "→ Installing dependencies..."
	pnpm install
	@echo "→ Copying .env.example to .env (if .env does not exist)..."
	@test -f .env || cp .env.example .env
	@echo "→ Setup complete. Run 'docker compose up -d' then 'make migrate' to continue."

# ─────────────────────────────────────────────
# Development
# ─────────────────────────────────────────────
dev:
	@echo "→ Starting API, worker, and web in parallel..."
	pnpm --parallel --filter './apps/*' run dev

migrate:
	@echo "→ Running Prisma migrations..."
	pnpm --filter @afr/domain exec prisma migrate deploy

migrate-dev:
	@echo "→ Running Prisma migrations in dev mode (creates migration files)..."
	pnpm --filter @afr/domain exec prisma migrate dev

# ─────────────────────────────────────────────
# Testing
# ─────────────────────────────────────────────
test: test-unit test-integration

test-unit:
	@echo "→ Running unit tests..."
	pnpm --recursive run test:unit

test-integration:
	@echo "→ Running integration tests (requires Docker services)..."
	pnpm --recursive run test:integration

# ─────────────────────────────────────────────
# Code Quality
# ─────────────────────────────────────────────
lint:
	@echo "→ Running ESLint..."
	pnpm --recursive run lint

format:
	@echo "→ Formatting with Prettier..."
	pnpm --recursive run format

format-check:
	@echo "→ Checking formatting..."
	pnpm --recursive run format:check

typecheck:
	@echo "→ Type checking all packages..."
	pnpm --recursive run typecheck

# ─────────────────────────────────────────────
# Build
# ─────────────────────────────────────────────
build:
	@echo "→ Building all packages..."
	pnpm --recursive run build

# ─────────────────────────────────────────────
# Demo
# ─────────────────────────────────────────────
demo:
	@echo "→ Seeding demo data..."
	pnpm --filter @afr/api exec tsx scripts/seed.ts
	@echo "→ Running scripted demonstration..."
	bash scripts/demo.sh

# ─────────────────────────────────────────────
# Docker
# ─────────────────────────────────────────────
up:
	docker compose up -d

down:
	docker compose down

down-volumes:
	@echo "WARNING: This will delete all local data (PostgreSQL, Azurite volumes)."
	@read -p "Continue? [y/N] " confirm && [ "$$confirm" = "y" ]
	docker compose down -v

logs:
	docker compose logs -f

# ─────────────────────────────────────────────
# Cleanup
# ─────────────────────────────────────────────
clean:
	@echo "→ Removing build artifacts..."
	find . -name "dist" -type d -not -path "*/node_modules/*" | xargs rm -rf
	find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" | xargs rm -f
	find . -name "coverage" -type d -not -path "*/node_modules/*" | xargs rm -rf
	@echo "→ Done."

clean-all: clean
	@echo "→ Removing node_modules (this will require 'make setup' to rebuild)..."
	find . -name "node_modules" -type d -maxdepth 3 | xargs rm -rf
	@echo "→ Done."
