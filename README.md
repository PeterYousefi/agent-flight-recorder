# Agent Flight Recorder

**A local-first execution control plane for observable, replayable, cost-aware AI agent workloads.**

[![CI](https://github.com/PeterYousefi/agent-flight-recorder/actions/workflows/ci.yml/badge.svg)](https://github.com/PeterYousefi/agent-flight-recorder/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

---

## Why This Exists

AI agent frameworks are good at defining and running agent logic. What they typically don't expose as a composable layer is:

- durable execution state with inspectable history
- structured event capture across async boundaries
- per-execution cost budgets with enforcement
- retry policies with idempotency guarantees
- dead-letter handling for permanently failed executions
- deterministic replay for incident investigation
- OpenTelemetry traces spanning agent → tool → result
- a dashboard showing operational health across all executions

Agent Flight Recorder provides exactly this control and observability layer. It wraps execution — including Sapiom tool calls via `@sapiom/tools` — with the production infrastructure primitives that let you understand, operate, and debug agentic workloads.

The name is deliberate. Like an aircraft flight recorder, this system captures everything: every state transition, every tool call, every retry decision, every cost event. When something goes wrong, you can inspect it. When you want to understand what happened, you can replay it.

---

## Architecture

```
React Dashboard (ops UI)
        │
Fastify REST API (:3000)
        │
   ┌────┴────┐
   │         │
PostgreSQL  Service Bus Queue (Azure Service Bus Emulator)
   │         │
   └────┬────┘
        │
Execution Worker
        │
ExecutionProvider
   ├── MockProvider (default, no credentials needed)
   └── SapiomProvider (@sapiom/tools, optional)
        │
Azurite (artifact storage)

All services → OTel Collector → Prometheus + Tempo → Grafana (:3000)
```

Full architecture diagrams: [docs/architecture.md](docs/architecture.md)

---

## Capabilities

| Feature                  | Description                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------- |
| **Execution lifecycle**  | PENDING → QUEUED → RUNNING → SUCCEEDED/FAILED/CANCELLED/BUDGET_EXCEEDED/DEAD_LETTERED |
| **Event log**            | Immutable, ordered event record for every execution                                   |
| **Retries**              | Exponential backoff with jitter, configurable per execution                           |
| **Idempotency**          | Duplicate submissions with the same key return the original execution                 |
| **Dead-letter handling** | Inspect permanently failed executions and requeue them                                |
| **Cancellation**         | Cancel a running or queued execution via API                                          |
| **Cost governance**      | Budget policies with pre-execution cost estimates and enforcement                     |
| **Replay**               | Re-run with original inputs (input mode) or against mocks (simulation mode)           |
| **Failure injection**    | MockProvider with deterministic failure scenarios for demo                            |
| **Artifact storage**     | Large payloads stored in Azurite (Azure Blob compatible)                              |
| **OTel tracing**         | Distributed traces spanning HTTP → queue → worker → provider                          |
| **Metrics**              | 11 Prometheus metrics, pre-provisioned Grafana dashboards                             |
| **Sapiom integration**   | Optional `@sapiom/tools` integration; falls back to MockProvider                      |

---

## $0 Azure Cost for Local Development

The entire stack runs locally via Docker. No Azure subscription, no Azure credentials, no Azure cost.

| Cloud service                 | Local equivalent                                       |
| ----------------------------- | ------------------------------------------------------ |
| Azure Service Bus             | Official Microsoft Service Bus emulator (Docker)       |
| Azure Blob Storage            | Azurite (Docker)                                       |
| Azure Monitor                 | OTel Collector + Prometheus + Grafana + Tempo (Docker) |
| Azure Database for PostgreSQL | PostgreSQL 16 (Docker)                                 |
| Azure Key Vault               | `.env` file                                            |

Real Azure deployment is documented in [docs/azure-deployment.md](docs/azure-deployment.md) and requires explicit `ALLOW_AZURE_DEPLOY=true`. It will never run automatically.

---

## 5-Minute Local Setup

**Prerequisites:** Docker Desktop, Node.js 22+, pnpm 9+

```bash
# 1. Clone
git clone https://github.com/PeterYousefi/agent-flight-recorder.git
cd agent-flight-recorder

# 2. Configure environment (defaults work for local Docker setup)
cp .env.example .env

# 3. Install dependencies
make setup

# 4. Start infrastructure (PostgreSQL, Service Bus emulator, Azurite, OTel stack)
docker compose up -d

# 5. Run migrations and start all services
make dev
```

Services:

- Dashboard: http://localhost:5173
- API: http://localhost:3000
- API docs: http://localhost:3000/api/docs
- Grafana: http://localhost:3001 (admin/admin)
- Prometheus: http://localhost:9090

T-02 implementation notes:

- Service Bus, OTel Collector, and Tempo use companion health-check containers because their images cannot run the required shell-based probes.
- Grafana uses port 3001 locally instead of the port 3000 listed in ADR-0006.

---

## Demo Scenarios

```bash
make demo
```

Or launch scenarios from the **Demo Lab** page in the dashboard. Available scenarios:

1. Successful execution — full lifecycle, events, trace
2. Transient failure → automatic retry → success
3. Budget exceeded — rejected before execution
4. Timeout — execution terminated mid-flight
5. Permanent failure → dead-letter → requeue
6. Replay — simulation replay of a failed execution

All scenarios use `MockProvider` — no Sapiom credentials or API costs required.

---

## Technology Stack

| Layer              | Technology                                                        |
| ------------------ | ----------------------------------------------------------------- |
| Language           | TypeScript (strict)                                               |
| API                | Node.js 22 + Fastify                                              |
| Worker             | Node.js 22                                                        |
| Dashboard          | React + TypeScript + Vite                                         |
| ORM                | Prisma + PostgreSQL 16                                            |
| Queue              | `@azure/service-bus` → Azure Service Bus emulator                 |
| Artifact storage   | `@azure/storage-blob` → Azurite                                   |
| Observability      | OpenTelemetry SDK → OTel Collector → Prometheus + Tempo → Grafana |
| Sapiom integration | `@sapiom/tools` (optional)                                        |
| Testing            | Vitest                                                            |
| Monorepo           | pnpm workspaces                                                   |

---

## Testing

```bash
make test          # all tests
make test-unit     # unit tests only (no Docker required)
make test-integration  # integration tests (requires docker compose up -d)
```

Test coverage includes:

- Every state machine transition (unit)
- Every budget policy boundary (unit)
- Retry and backoff logic (unit)
- Idempotency under concurrent requests (integration)
- Worker end-to-end flow (integration)
- Replay immutability (integration)
- State machine invariants (property-based)

---

## Sapiom Integration

Agent Flight Recorder wraps Sapiom tool calls via `@sapiom/tools`:

```typescript
// SapiomProvider uses the documented @sapiom/tools createClient()
const client = createClient({ apiKey: process.env.SAPIOM_API_KEY })
```

When `SAPIOM_API_KEY` is not set, the system automatically uses `MockProvider`. The dashboard, demo, and all tests work without a Sapiom account.

What Agent Flight Recorder adds on top of Sapiom:

- Durable execution state and history
- Budget enforcement before and during execution
- Structured event log with replay capability
- OTel traces for every tool invocation
- Dead-letter handling for failed executions
- Operational dashboard

See [docs/integrations/sapiom.md](docs/integrations/sapiom.md) for the full integration description, including honest documentation of what Sapiom's public SDK does and does not provide.

---

## Repository Structure

```
apps/
  api/          Fastify REST API
  worker/       Async execution worker
  web/          React operations dashboard
packages/
  domain/       Core types, state machine, interfaces (no I/O)
  providers/    MockProvider + SapiomProvider
  observability/ OTel setup, metrics, structured logger
infra/
  local/        Docker Compose + emulator configs
  azure/        Bicep IaC templates (never auto-applied)
docs/
  adr/          Architecture Decision Records
  integrations/ Sapiom integration documentation
scripts/
  demo.sh       Scripted demonstration
  seed.ts       Demo data seeder
  azure/        Cost estimation + teardown scripts
.kiro/
  steering/     Persistent context for Kiro AI
  specs/        Requirements, design, tasks
```

---

## Engineering Decisions

See [docs/adr/](docs/adr/) for full Architecture Decision Records.

| ADR                                                  | Decision                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| [0001](docs/adr/0001-language-and-framework.md)      | TypeScript + Node.js + Fastify — native Sapiom SDK integration         |
| [0002](docs/adr/0002-event-driven-execution.md)      | Event-driven async execution — durability and inspectability           |
| [0003](docs/adr/0003-service-bus-abstraction.md)     | MessageBus interface over Azure Service Bus — testability + cloud path |
| [0004](docs/adr/0004-postgresql-persistence.md)      | PostgreSQL + Prisma — explicit migrations, strong typing               |
| [0005](docs/adr/0005-local-first-azure-emulation.md) | Local-first with Azure emulators — $0 cost by default                  |
| [0006](docs/adr/0006-opentelemetry.md)               | OpenTelemetry — vendor-neutral, spans across async boundaries          |
| [0007](docs/adr/0007-replay-semantics.md)            | Two replay modes — honest about non-determinism                        |

---

## Known Limitations

- Sapiom's `@sapiom/tools` SDK is in v0.x beta — the integration surface may change before v1.0.
- Sapiom does not currently expose a public API for execution status, cost tracking, or replay. The `SapiomProvider` wraps capability calls but cannot provide measured cost data (estimated cost only).
- The Azure Service Bus emulator requires a SQL Server Linux sidecar (~500MB Docker footprint).
- Grafana Tempo stores traces in memory by default — traces do not persist across container restarts.
- Simulation replay uses `MockProvider` — it does not reproduce the exact bytes of the original provider response.

---

## License

Apache-2.0 — see [LICENSE](LICENSE).
