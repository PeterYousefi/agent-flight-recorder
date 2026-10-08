---
inclusion: always
---

# Architecture Context

## Component Boundaries

```
apps/
  api/        — Fastify REST API. Receives execution requests, writes to DB, publishes to queue.
  worker/     — Async execution worker. Consumes queue, invokes providers, persists events.
  web/        — React + TypeScript operations dashboard.

packages/
  domain/     — Core types, state machine, event schemas, budget logic. No I/O.
  providers/  — ExecutionProvider interface + MockProvider + SapiomProvider.
  observability/ — OTel setup, structured logger, correlation ID utilities.
```

**Dependency rule:** `domain` has zero runtime dependencies on `api`, `worker`, `web`, or `providers`. Everything depends on `domain`; `domain` depends on nothing internal.

## Architectural Decisions

### Language: TypeScript (strict)

Sapiom's SDK is TypeScript-first (`@sapiom/tools`, `@sapiom/agent`). Choosing TypeScript gives native SDK integration, shared types across packages, and a single language to reason about end-to-end. See `docs/adr/0001-language-and-framework.md`.

### Event-Driven Execution

Execution requests flow: API → MessageBus → Worker → Provider → DB/Events. The API is not responsible for waiting on provider results. The worker is the sole driver of execution state transitions. See `docs/adr/0002-event-driven-execution.md`.

### MessageBus Abstraction

```typescript
interface MessageBus {
  publish(queue: string, message: Message): Promise<void>
  subscribe(queue: string, handler: MessageHandler): Promise<void>
  ack(messageId: string): Promise<void>
  nack(messageId: string, requeue: boolean): Promise<void>
  deadLetter(messageId: string, reason: string): Promise<void>
}
```

Implementations:

- `InMemoryMessageBus` — used in unit tests, zero external dependencies
- `ServiceBusMessageBus` — wraps `@azure/service-bus` targeting the official Azure Service Bus emulator locally, or real Azure Service Bus in production

No Azure-specific types leak into `domain/` or `api/`. See `docs/adr/0003-service-bus-abstraction.md`.

### Persistence: PostgreSQL + Prisma

Prisma for schema migrations, strong typing, and async support. PostgreSQL in Docker locally. See `docs/adr/0004-postgresql-persistence.md`.

### Local Azure Emulation

| Cloud Service      | Local Emulator                                                               |
| ------------------ | ---------------------------------------------------------------------------- |
| Azure Service Bus  | `mcr.microsoft.com/azure-messaging/servicebus-emulator` + SQL Server sidecar |
| Azure Blob Storage | `mcr.microsoft.com/azure-storage/azurite`                                    |
| Azure Key Vault    | `.env` file + environment variables (dev only)                               |
| Azure Monitor      | OpenTelemetry Collector + Prometheus + Grafana + Tempo                       |

See `docs/adr/0005-local-first-azure-emulation.md`.

### Observability: OpenTelemetry

Every execution carries: `execution_id`, `trace_id`, `span_id`, `agent_id`, `provider`, `attempt`, `status`. OTel context propagates across the HTTP → queue → worker boundary via message attributes. Local: OTel Collector → Prometheus (metrics) + Tempo (traces) → Grafana. See `docs/adr/0006-opentelemetry.md`.

### Replay Semantics

Two modes:

1. **Input replay** — same normalized input, new execution, links `original_execution_id`. Uses live providers.
2. **Simulation replay** — same normalized input, but forces the `MockProvider`. Safe for incident investigation without side effects.

A replay never mutates the original execution record. See `docs/adr/0007-replay-semantics.md`.

## Messaging Model

```
POST /api/v1/executions
  → ExecutionCreated event persisted
  → message published to "executions" queue

Worker consumes "executions" queue
  → acquires idempotency lock
  → transitions execution: QUEUED → RUNNING
  → invokes ExecutionProvider
  → on success: RUNNING → SUCCEEDED + events + cost record
  → on retryable failure: RUNNING → RETRY_SCHEDULED → re-enqueue with backoff
  → on terminal failure: RUNNING → FAILED → DEAD_LETTERED (after max attempts)
  → on budget exceeded: RUNNING → BUDGET_EXCEEDED
  → on cancel signal: RUNNING → CANCELLED
```

## Persistence Model

Primary tables (managed by Prisma migrations):

- `executions` — lifecycle state, idempotency key, budget policy
- `execution_attempts` — per-attempt record with start/end/error
- `execution_events` — ordered event log per execution (monotonic sequence)
- `tool_invocations` — individual tool call records
- `cost_records` — estimated and measured cost per execution/attempt
- `artifacts` — metadata for objects stored in Azurite
- `replays` — links original_execution_id → replay_execution_id
- `audit_records` — immutable control action log
- `dead_letters` — terminal failures awaiting inspection/requeue

## Provider Architecture

```typescript
interface ExecutionProvider {
  readonly name: string
  validateRequest(req: ExecutionRequest): Promise<ValidationResult>
  estimateCost(req: ExecutionRequest): Promise<CostEstimate>
  execute(req: ExecutionRequest, ctx: ExecutionContext): Promise<ExecutionResult>
  cancel(executionId: string): Promise<void>
  normalizeResult(raw: unknown): NormalizedResult
  healthCheck(): Promise<HealthStatus>
}
```

Implementations:

- `MockProvider` — deterministic, supports failure injection scenarios
- `SapiomProvider` — implements the verified HTTPS Router chat-completions contract with Bearer `SAPIOM_API_KEY`. Default disabled; explicit unavailable Sapiom requests fail. See `docs/integrations/sapiom.md`.

## Cloud/Local Separation

```
infra/
  local/    — docker-compose.yml, Service Bus config.json, Azurite setup
  azure/    — Bicep templates (never applied automatically)

scripts/
  azure/    — estimate-or-explain-cost.sh, destroy.sh (require ALLOW_AZURE_DEPLOY=true)
```

CI never touches Azure. Azure IaC requires explicit `ALLOW_AZURE_DEPLOY=true`.
