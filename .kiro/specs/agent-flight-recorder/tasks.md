# Agent Flight Recorder — Implementation Tasks

Each task maps to one or more coherent git commits. Tasks are ordered by dependency. Mark `[x]` when complete.

---

## Phase 1 — Repository Foundation

- [ ] **T-01** Initialize pnpm workspace monorepo structure
  - `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`
  - Create `apps/api`, `apps/worker`, `apps/web`, `packages/domain`, `packages/providers`, `packages/observability` with skeleton `package.json` and `tsconfig.json`
  - Configure ESLint + Prettier at root
  - Commit: `chore: initialize pnpm workspace monorepo with package skeletons`

- [ ] **T-02** Add Docker Compose infrastructure stack
  - `docker-compose.yml` at root with: PostgreSQL, Service Bus emulator, SQL Server sidecar, Azurite, OTel Collector, Prometheus, Tempo, Grafana
  - `infra/local/servicebus-config.json` — define `executions` queue with dead-letter
  - `infra/local/otel-collector-config.yaml`
  - `infra/local/prometheus.yml`
  - `infra/local/grafana/datasources/` — Prometheus + Tempo
  - Verify stack starts: `docker compose up -d && docker compose ps`
  - Commit: `feat(infra): add complete local Docker Compose stack with Azure emulators`

- [ ] **T-03** Add Makefile and developer tooling
  - `Makefile` with: `setup`, `dev`, `test`, `test-unit`, `test-integration`, `lint`, `format`, `typecheck`, `demo`, `down`, `clean`, `migrate`
  - `.env.example` with all required variables and placeholder values
  - `.gitignore` comprehensive for Node/pnpm/Docker/macOS
  - `LICENSE` (Apache-2.0)
  - Commit: `chore: add Makefile, .env.example, .gitignore, LICENSE`

- [ ] **T-04** Add CI skeleton (GitHub Actions)
  - `.github/workflows/ci.yml` — format check, lint, typecheck, unit tests, build validation
  - `.github/dependabot.yml` — npm and GitHub Actions dependency updates
  - Commit: `ci: add GitHub Actions CI workflow and Dependabot config`

---

## Phase 2 — Domain Model

- [ ] **T-05** Implement execution types and status enum
  - `packages/domain/src/execution.ts` — `ExecutionStatus` enum, `Execution` type, `BudgetPolicy` type, `ExecutionRequest` type
  - `packages/domain/src/errors.ts` — typed domain errors
  - Unit tests: enum values, type guards
  - Commit: `feat(domain): add execution types, status enum, and domain errors`

- [ ] **T-06** Implement execution state machine
  - `packages/domain/src/state-machine.ts` — `transition()`, `isTerminal()`, `canTransitionTo()`, `VALID_TRANSITIONS` map
  - Unit tests: every valid transition passes, every invalid transition throws `InvalidStateTransitionError`
  - Property test: terminal states cannot transition to non-terminal states
  - Commit: `feat(domain): implement execution state machine with full transition coverage`

- [ ] **T-07** Implement execution event schema
  - `packages/domain/src/events.ts` — `ExecutionEventType` enum, `ExecutionEvent` type, event factory functions
  - All event types from requirements implemented
  - Unit tests: event construction, sequence validation
  - Commit: `feat(domain): add structured execution event schema and factory functions`

- [ ] **T-08** Implement budget policy enforcement logic
  - `packages/domain/src/budget.ts` — `BudgetPolicy` type, `checkBudget()`, `BudgetDecision`, `isWithinBudget()`
  - Unit tests: every boundary condition (at limit, just over, just under, warning threshold)
  - Commit: `feat(domain): implement budget policy with cost and duration enforcement`

- [ ] **T-09** Define MessageBus, ArtifactStore, ExecutionProvider interfaces
  - `packages/domain/src/messaging.ts`
  - `packages/domain/src/storage.ts`
  - `packages/domain/src/providers.ts`
  - Export all from `packages/domain/src/index.ts`
  - Commit: `feat(domain): define MessageBus, ArtifactStore, ExecutionProvider interfaces`

- [ ] **T-10** Add Prisma schema and initial migration
  - `packages/domain/prisma/schema.prisma` — all tables from design
  - Run `prisma migrate dev --name initial_schema`
  - Verify migration SQL is correct and committed
  - Commit: `feat(domain): add Prisma schema and initial database migration`

---

## Phase 3 — API Service

- [ ] **T-11** Bootstrap Fastify API with core plugins
  - `apps/api/src/server.ts` — Fastify instance with: `@fastify/sensible`, `@fastify/cors`, `@fastify/swagger`, `@fastify/swagger-ui`
  - Request ID plugin (generate or propagate `X-Request-Id`)
  - Error handler plugin — catch all, return standard error shape, never expose stack traces
  - Health and readiness routes
  - `GET /metrics` — Prometheus scrape endpoint
  - Commit: `feat(api): bootstrap Fastify server with error handler, health, and OpenAPI`

- [ ] **T-12** Implement POST /api/v1/executions
  - Zod schema validation for request body
  - Idempotency key check (SELECT existing, return 200 if found)
  - Persist execution + `execution.created` event
  - Publish to Service Bus queue with OTel trace context in message attributes
  - Return 202
  - Unit tests: validation rejections, idempotency deduplication
  - Commit: `feat(api): add POST /executions with idempotency and queue publish`

- [ ] **T-13** Implement GET execution endpoints
  - `GET /api/v1/executions` — paginated list with filters (status, provider, date range)
  - `GET /api/v1/executions/:id` — full execution detail
  - `GET /api/v1/executions/:id/events` — ordered event log
  - `GET /api/v1/executions/:id/cost` — cost breakdown
  - `GET /api/v1/executions/:id/trace` — trace correlation IDs
  - Tests: pagination, filter combinations, 404 on missing
  - Commit: `feat(api): add GET execution endpoints with pagination and filtering`

- [ ] **T-14** Implement control action endpoints
  - `POST /api/v1/executions/:id/cancel`
  - `POST /api/v1/executions/:id/retry`
  - `POST /api/v1/executions/:id/replay`
  - `GET /api/v1/dead-letter`, `GET /api/v1/dead-letter/:id`
  - `POST /api/v1/dead-letter/:id/requeue`
  - Tests: state validation (409 on wrong state), audit record creation
  - Commit: `feat(api): add cancel, retry, replay, and dead-letter management endpoints`

---

## Phase 4 — Async Worker

- [ ] **T-15** Implement InMemoryMessageBus
  - `packages/domain/src/messaging/in-memory-bus.ts`
  - Support publish, subscribe, ack (implicit on resolve), dead-letter
  - Support `scheduledEnqueueTimeUtc` for delayed delivery
  - Tests: publish → subscribe delivery, dead-letter, delayed delivery
  - Commit: `feat(domain): implement InMemoryMessageBus for testing`

- [ ] **T-16** Implement ServiceBusMessageBus
  - `apps/worker/src/transport/service-bus.ts` wrapping `@azure/service-bus`
  - OTel trace context inject/extract via `applicationProperties`
  - Connection string from `AZURE_SERVICE_BUS_CONNECTION_STRING`
  - Health check method
  - Commit: `feat(worker): implement ServiceBusMessageBus wrapping @azure/service-bus`

- [ ] **T-17** Implement execution worker engine
  - `apps/worker/src/engine/execution-engine.ts`
  - State machine transitions: PENDING→QUEUED→RUNNING
  - Idempotency lock via `SELECT FOR UPDATE SKIP LOCKED`
  - Cancel signal detection before provider call
  - Budget check before provider call
  - Provider invocation + result normalization
  - Success path: RUNNING→SUCCEEDED + cost record + events
  - Tests: happy path with MockProvider, cancel mid-flight, budget exceeded
  - Commit: `feat(worker): implement execution engine with state machine and budget enforcement`

- [ ] **T-18** Implement retry logic
  - `apps/worker/src/engine/retry.ts` — `computeBackoff()`, `isRetryable()`, `RetryPolicy`
  - Exponential backoff with jitter
  - Retry vs non-retry error classification
  - Re-publish with `scheduledEnqueueTimeUtc` for backoff
  - Retry exhaustion → FAILED → DEAD_LETTERED path
  - Tests: backoff calculation, retry exhaustion, non-retryable bypass
  - Commit: `feat(worker): add exponential backoff retry with jitter and dead-letter on exhaustion`

---

## Phase 5 — Providers

- [ ] **T-19** Implement MockProvider
  - `packages/providers/src/mock/mock-provider.ts`
  - Scenarios: `success`, `timeout`, `transient_failure`, `permanent_failure`, `slow_response`, `malformed_response`, `budget_exceeded_scenario`, `rate_limited`
  - Scenario selected from `request.metadata.mock_scenario`
  - Configurable latency and cost estimate per scenario
  - Tests: each scenario produces expected result type
  - Commit: `feat(providers): implement MockProvider with all failure injection scenarios`

- [ ] **T-20** Implement SapiomProvider
  - `packages/providers/src/sapiom/sapiom-provider.ts`
  - Uses `createClient({ apiKey })` from `@sapiom/tools`
  - Gracefully degrades to MockProvider when `SAPIOM_API_KEY` is absent (logs warning)
  - Only calls documented, verified `@sapiom/tools` methods
  - `docs/integrations/sapiom.md` written documenting exactly what is used
  - Tests: absent API key → mock fallback, result normalization
  - Commit: `feat(providers): implement SapiomProvider with @sapiom/tools and mock fallback`

---

## Phase 6 — Observability

- [ ] **T-21** Bootstrap OTel SDK in API and Worker
  - `packages/observability/src/tracer.ts` — SDK init with OTLP exporter
  - `packages/observability/src/metrics.ts` — all 11 metrics defined
  - `packages/observability/src/logger.ts` — structured JSON logger with trace context
  - OTel init called before any imports in `apps/api/src/server.ts` and `apps/worker/src/worker.ts`
  - Commit: `feat(observability): bootstrap OpenTelemetry SDK with metrics and structured logging`

- [ ] **T-22** Instrument execution spans and metrics
  - API: span for HTTP request, execution creation, queue publish
  - Worker: span for message consume, state transitions, provider call, artifact storage
  - Trace context propagation via message attributes
  - Metric increments at all defined recording points
  - Verify traces appear in Grafana Tempo
  - Commit: `feat(observability): instrument execution flow with OTel spans and metrics`

- [ ] **T-23** Add Grafana dashboards
  - `infra/local/grafana/dashboards/execution-overview.json` — key metrics
  - `infra/local/grafana/dashboards/execution-detail.json` — per-execution trace/metric drill-down
  - Provisioned automatically via Grafana datasource config
  - Commit: `feat(observability): add pre-provisioned Grafana dashboards`

---

## Phase 7 — Artifact Storage

- [ ] **T-24** Implement AzuriteArtifactStore
  - `apps/worker/src/storage/azurite-store.ts` wrapping `@azure/storage-blob`
  - Upload, download, delete, list by execution ID
  - Persist metadata to `artifacts` table
  - Large payloads (>4KB) stored in Azurite instead of DB
  - Commit: `feat(worker): implement AzuriteArtifactStore for execution artifacts`

---

## Phase 8 — Replay

- [ ] **T-25** Implement replay endpoint and worker support
  - API: `POST /api/v1/executions/:id/replay` — validate terminal state, create replay execution, insert `replays` record, emit events on both executions
  - Worker: detect `replay_mode=simulation` → override provider to MockProvider
  - Tests: replay of non-terminal execution rejected, original execution unchanged after replay, simulation uses mock
  - Commit: `feat(replay): implement input and simulation replay with full audit trail`

---

## Phase 9 — Operations Dashboard

- [ ] **T-26** Scaffold React dashboard with routing and API client
  - Vite + React + TypeScript
  - React Router for pages: Overview, Executions, ExecutionDetail, DeadLetter, DemoLab
  - Typed API client using `fetch` with base URL from env
  - TanStack Query for data fetching
  - Commit: `feat(web): scaffold React dashboard with routing and typed API client`

- [ ] **T-27** Implement Overview and Executions List pages
  - Overview: aggregate stats, success/failure rates, estimated cost, dead-letter count
  - Executions: paginated table with status filter, provider filter, date range
  - Status badges with color coding
  - Commit: `feat(web): add Overview and Executions List pages`

- [ ] **T-28** Implement Execution Detail page
  - Lifecycle timeline (visual state transitions with timestamps)
  - Attempt list with per-attempt errors
  - Event log in sequence order
  - Cost breakdown panel
  - Trace ID with link to Grafana Tempo
  - Cancel / Retry / Replay buttons with confirmation
  - Commit: `feat(web): add Execution Detail page with timeline and action buttons`

- [ ] **T-29** Implement Dead Letter and Demo Lab pages
  - Dead Letter: table of failed executions, inspect detail, requeue action
  - Demo Lab: scenario cards (Success, Transient Failure, Budget Exceeded, Timeout, Dead-Letter, Replay)
  - Each scenario submits a pre-configured execution and navigates to the detail view
  - Commit: `feat(web): add Dead Letter inspector and Demo Lab scenario launcher`

---

## Phase 10 — Azure IaC (Documentation Only)

- [ ] **T-30** Create Azure Bicep templates
  - `infra/azure/main.bicep` — Container Apps, Service Bus, PostgreSQL, Blob Storage, Key Vault, Monitor
  - `scripts/azure/estimate-or-explain-cost.sh`
  - `scripts/azure/destroy.sh`
  - `docs/azure-deployment.md` — architecture, cost estimates, deployment steps, teardown
  - Both scripts gate on `ALLOW_AZURE_DEPLOY=true`
  - Commit: `feat(infra): add Azure Bicep IaC templates and deployment documentation`

---

## Phase 11 — Seed Data and Demo Script

- [ ] **T-31** Add demo seed data and demo script
  - `scripts/seed.ts` — creates representative executions across all statuses
  - `scripts/demo.sh` — 10-step scripted demonstration
  - Executions visible in dashboard immediately after `make demo`
  - Commit: `feat(demo): add seed data script and scripted demonstration`

---

## Phase 12 — Integration and Property Tests

- [ ] **T-32** Add integration test suite
  - Worker end-to-end: submit → queue → worker → DB with InMemoryMessageBus + real PostgreSQL
  - Idempotency under concurrent requests
  - Retry exhaustion → dead-letter
  - Budget exceeded path
  - Replay immutability (original unchanged)
  - Commit: `test: add integration test suite covering worker end-to-end and reliability invariants`

- [ ] **T-33** Add property-based tests
  - State machine: no sequence of valid transitions reaches an impossible state
  - Sequence numbers: always monotonic per execution
  - Costs: never negative
  - Idempotency: N identical submissions produce exactly 1 execution
  - Commit: `test: add property-based tests for state machine and idempotency invariants`

---

## Phase 13 — Security and Hardening

- [ ] **T-34** Add security scanning and dependency audit
  - `.github/workflows/ci.yml` — add `pnpm audit` step
  - Add `gitleaks` or `truffleHog` scan to CI
  - Add `trivy` or `snyk` scan for Docker images (optional)
  - Commit: `ci: add security scanning, dependency audit, and secret detection`

---

## Phase 14 — Documentation and Polish

- [ ] **T-35** Write technical documentation
  - `docs/architecture.md`
  - `docs/reliability.md`
  - `docs/replay.md`
  - `docs/cost-controls.md`
  - `docs/observability.md`
  - `docs/security.md`
  - `docs/local-development.md`
  - `docs/integrations/sapiom.md`
  - Commit: `docs: add technical documentation suite`

- [ ] **T-36** Write README and add architecture diagrams
  - Complete `README.md` per spec (elevator pitch, setup, demo, stack, ADR summary)
  - Embed Mermaid diagrams
  - Commit: `docs: write README with architecture diagrams and 5-minute setup guide`
