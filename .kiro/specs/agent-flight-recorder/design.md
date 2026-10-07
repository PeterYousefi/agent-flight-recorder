# Agent Flight Recorder — Design

## System Context

```mermaid
C4Context
  title System Context — Agent Flight Recorder

  Person(operator, "Platform Operator", "Monitors and manages agent executions via the dashboard")
  Person(developer, "Developer", "Submits execution requests via REST API or Demo Lab")

  System(afr, "Agent Flight Recorder", "Execution control plane: lifecycle tracking, cost governance, retries, replay, observability")

  System_Ext(sapiom, "Sapiom Platform", "AI agent execution engine and tool capability network (@sapiom/tools)")
  System_Ext(azure_sb, "Azure Service Bus", "Managed queue/topic service (emulated locally)")
  System_Ext(azure_blob, "Azure Blob Storage", "Object storage for artifacts (emulated by Azurite)")
  System_Ext(grafana, "Grafana + Tempo + Prometheus", "Observability dashboards (local OTel stack)")

  Rel(operator, afr, "Views dashboard, inspects executions, triggers retry/replay/requeue")
  Rel(developer, afr, "POST /api/v1/executions, GET execution status/events")
  Rel(afr, sapiom, "Invokes tools via @sapiom/tools createClient() [optional, falls back to MockProvider]")
  Rel(afr, azure_sb, "Publishes/consumes execution messages")
  Rel(afr, azure_blob, "Stores/retrieves execution artifacts")
  Rel(afr, grafana, "Emits OTLP traces, metrics, logs")
```

## Container Architecture

```mermaid
C4Container
  title Container Architecture — Agent Flight Recorder

  Container(web, "Web Dashboard", "React + TypeScript + Vite", "Operations UI: overview, executions, detail, dead-letter, demo lab")
  Container(api, "API Service", "Node.js + Fastify", "REST API, input validation, idempotency, queue publish")
  Container(worker, "Execution Worker", "Node.js", "Queue consumer, state machine driver, provider invocation, retry logic")

  ContainerDb(postgres, "PostgreSQL 16", "Docker", "Executions, events, attempts, cost records, artifacts metadata, audit log")
  ContainerDb(servicebus, "Service Bus Emulator", "Docker (MCR)", "executions queue + dead-letter queue")
  ContainerDb(azurite, "Azurite", "Docker (MCR)", "Blob storage for execution artifacts")

  Container(otel_col, "OTel Collector", "Docker", "Receives OTLP, fans out to Prometheus + Tempo")
  ContainerDb(prometheus, "Prometheus", "Docker", "Metrics store")
  ContainerDb(tempo, "Grafana Tempo", "Docker", "Trace store")
  Container(grafana, "Grafana", "Docker", "Dashboards for metrics and traces")

  Rel(web, api, "HTTP REST", "JSON/HTTPS")
  Rel(api, postgres, "Prisma client", "TCP")
  Rel(api, servicebus, "@azure/service-bus SDK", "AMQP")
  Rel(api, otel_col, "OTLP/HTTP", "4318")
  Rel(worker, postgres, "Prisma client", "TCP")
  Rel(worker, servicebus, "@azure/service-bus SDK", "AMQP")
  Rel(worker, azurite, "@azure/storage-blob SDK", "HTTP")
  Rel(worker, otel_col, "OTLP/HTTP", "4318")
  Rel(otel_col, prometheus, "Prometheus exporter")
  Rel(otel_col, tempo, "OTLP push")
  Rel(grafana, prometheus, "PromQL queries")
  Rel(grafana, tempo, "TraceQL queries")
```

## Execution Sequence — Happy Path

```mermaid
sequenceDiagram
  participant Client
  participant API
  participant DB
  participant Queue as Service Bus Queue
  participant Worker
  participant Provider as ExecutionProvider

  Client->>API: POST /api/v1/executions
  API->>API: Validate request (Zod)
  API->>API: Check idempotency key
  API->>DB: INSERT execution (PENDING) + event(execution.created)
  API->>Queue: publish { executionId, traceContext }
  API-->>Client: 202 { execution_id, status: PENDING }

  Queue-->>Worker: deliver message
  Worker->>Worker: Extract OTel trace context
  Worker->>DB: SELECT FOR UPDATE — acquire idempotency lock
  Worker->>DB: UPDATE status PENDING→QUEUED + event(execution.queued)
  Worker->>DB: UPDATE status QUEUED→RUNNING + event(execution.started)
  Worker->>Provider: estimateCost(request)
  Provider-->>Worker: CostEstimate
  Worker->>Worker: Check budget policy
  Worker->>Provider: execute(request, ctx)
  Provider-->>Worker: ExecutionResult
  Worker->>Provider: normalizeResult(raw)
  Worker->>DB: UPDATE status RUNNING→SUCCEEDED + cost record + event(execution.succeeded)
  Worker->>Queue: ack(messageId)
```

## Execution Sequence — Retry Path

```mermaid
sequenceDiagram
  participant Queue as Service Bus Queue
  participant Worker
  participant Provider as ExecutionProvider
  participant DB

  Queue-->>Worker: deliver message (attempt 1)
  Worker->>Provider: execute(request, ctx)
  Provider-->>Worker: TransientError (retryable)
  Worker->>DB: UPDATE RUNNING→RETRY_SCHEDULED + event(execution.retry_scheduled, attempt=1)
  Worker->>Queue: publish with scheduledEnqueueTimeUtc = now + backoff(1)
  Worker->>Queue: ack(original message)

  Note over Queue,Worker: After backoff delay...

  Queue-->>Worker: deliver message (attempt 2)
  Worker->>Provider: execute(request, ctx)
  Provider-->>Worker: Success
  Worker->>DB: UPDATE RUNNING→SUCCEEDED + events
  Worker->>Queue: ack(messageId)
```

## Execution Sequence — Dead-Letter Path

```mermaid
sequenceDiagram
  participant Queue as Service Bus Queue
  participant Worker
  participant Provider as ExecutionProvider
  participant DB
  participant DLQ as Dead-Letter Queue

  Queue-->>Worker: deliver message (attempt N = max_attempts)
  Worker->>Provider: execute(request, ctx)
  Provider-->>Worker: TerminalError (non-retryable) OR retries exhausted
  Worker->>DB: UPDATE RUNNING→FAILED + event(execution.failed)
  Worker->>DB: INSERT dead_letters record + event(execution.dead_lettered)
  Worker->>DB: UPDATE status FAILED→DEAD_LETTERED
  Worker->>Queue: deadLetter(messageId, reason)
  Note over Queue,Worker: Message moves to DLQ

  Note over DB: Operator inspects via GET /api/v1/dead-letter
  Note over DB: POST /api/v1/dead-letter/{id}/requeue → PENDING → re-enqueue
```

## Replay Sequence

```mermaid
sequenceDiagram
  participant Operator
  participant API
  participant DB
  participant Queue as Service Bus Queue
  participant Worker
  participant Provider as MockProvider or Live

  Operator->>API: POST /api/v1/executions/{id}/replay { mode: "simulation" }
  API->>DB: Fetch original execution (must be terminal)
  API->>DB: INSERT new execution (PENDING) with original_execution_id
  API->>DB: INSERT replays record (original_id → new_id, mode=simulation)
  API->>DB: INSERT event(execution.replayed) on original execution
  API->>Queue: publish { executionId: newId, replayMode: simulation, traceContext }
  API-->>Operator: 202 { replay_execution_id, original_execution_id, mode }

  Queue-->>Worker: deliver message
  Worker->>Worker: Detect replayMode=simulation → override provider to MockProvider
  Worker->>Provider: execute(request, ctx)
  Provider-->>Worker: MockResult
  Worker->>DB: UPDATE new execution RUNNING→SUCCEEDED
  Worker->>DB: INSERT event(execution.replayed) on new execution (links back to original)
```

## Domain Model

```mermaid
erDiagram
  executions {
    uuid id PK
    text status
    text agent_id
    text provider
    text operation
    jsonb input
    jsonb budget_policy
    text idempotency_key
    text replay_mode
    uuid original_execution_id FK
    timestamptz created_at
    timestamptz updated_at
  }

  execution_attempts {
    uuid id PK
    uuid execution_id FK
    int attempt_number
    text status
    text error_code
    text error_message
    bool retryable
    timestamptz started_at
    timestamptz completed_at
  }

  execution_events {
    uuid id PK
    uuid execution_id FK
    text event_type
    int sequence
    int version
    jsonb payload
    timestamptz timestamp
  }

  cost_records {
    uuid id PK
    uuid execution_id FK
    uuid attempt_id FK
    decimal estimated_usd
    decimal measured_usd
    text currency
    jsonb breakdown
    timestamptz created_at
  }

  dead_letters {
    uuid id PK
    uuid execution_id FK
    text reason
    text final_error
    int attempt_count
    timestamptz dead_lettered_at
    timestamptz requeued_at
  }

  replays {
    uuid id PK
    uuid original_execution_id FK
    uuid replay_execution_id FK
    text mode
    text initiated_by
    timestamptz created_at
  }

  artifacts {
    uuid id PK
    uuid execution_id FK
    text artifact_type
    text storage_key
    bigint size_bytes
    timestamptz created_at
  }

  audit_records {
    uuid id PK
    uuid execution_id FK
    text action
    text actor
    jsonb details
    timestamptz created_at
  }

  executions ||--o{ execution_attempts : "has"
  executions ||--o{ execution_events : "has"
  executions ||--o{ cost_records : "has"
  executions ||--o| dead_letters : "may become"
  executions ||--o{ artifacts : "may have"
  executions ||--o{ audit_records : "has"
  executions ||--o{ replays : "original of"
  executions ||--o{ replays : "replay of"
```

## Execution State Machine

```mermaid
stateDiagram-v2
  [*] --> PENDING : execution.created
  PENDING --> QUEUED : worker picks up message
  QUEUED --> RUNNING : worker begins execution
  RUNNING --> SUCCEEDED : provider success
  RUNNING --> RETRY_SCHEDULED : retryable failure, attempts remaining
  RUNNING --> FAILED : non-retryable failure OR retries exhausted
  RUNNING --> BUDGET_EXCEEDED : cost or duration limit hit
  RUNNING --> CANCELLED : cancel signal detected
  RUNNING --> WAITING : awaiting external signal (future)
  RETRY_SCHEDULED --> QUEUED : backoff elapsed, re-enqueued
  FAILED --> DEAD_LETTERED : dead-letter handler runs
  SUCCEEDED --> [*]
  CANCELLED --> [*]
  BUDGET_EXCEEDED --> [*]
  DEAD_LETTERED --> PENDING : operator requeues via API
```

## Package Structure

```
agent-flight-recorder/
├── apps/
│   ├── api/                    # Fastify REST API
│   │   ├── src/
│   │   │   ├── routes/         # Route handlers (one file per resource)
│   │   │   ├── plugins/        # Fastify plugins (auth, error handler, OTel)
│   │   │   ├── middleware/     # Request ID, correlation headers
│   │   │   └── server.ts       # App entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── worker/                 # Execution worker
│   │   ├── src/
│   │   │   ├── handlers/       # Message handlers
│   │   │   ├── engine/         # Execution engine (state machine driver)
│   │   │   └── worker.ts       # Entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                    # React dashboard
│       ├── src/
│       │   ├── pages/          # Overview, Executions, Detail, DeadLetter, DemoLab
│       │   ├── components/     # Shared UI components
│       │   ├── hooks/          # Data-fetching hooks
│       │   └── api/            # API client
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── domain/                 # Zero-dependency core types
│   │   ├── src/
│   │   │   ├── execution.ts    # Execution type + status enum
│   │   │   ├── state-machine.ts # Transition logic
│   │   │   ├── events.ts       # Event schemas + types
│   │   │   ├── budget.ts       # BudgetPolicy + enforcement logic
│   │   │   ├── messaging.ts    # MessageBus interface
│   │   │   ├── providers.ts    # ExecutionProvider interface
│   │   │   ├── storage.ts      # ArtifactStore interface
│   │   │   └── errors.ts       # Typed domain errors
│   │   └── package.json
│   ├── providers/              # Provider implementations
│   │   ├── src/
│   │   │   ├── mock/           # MockProvider + failure injection
│   │   │   └── sapiom/         # SapiomProvider wrapping @sapiom/tools
│   │   └── package.json
│   └── observability/          # OTel setup + logger
│       ├── src/
│       │   ├── tracer.ts       # OTel SDK init
│       │   ├── metrics.ts      # Metric definitions
│       │   └── logger.ts       # Structured JSON logger
│       └── package.json
├── infra/
│   ├── local/
│   │   ├── docker-compose.yml
│   │   ├── servicebus-config.json
│   │   ├── otel-collector-config.yaml
│   │   ├── prometheus.yml
│   │   └── grafana/
│   │       ├── dashboards/
│   │       └── datasources/
│   └── azure/
│       ├── main.bicep
│       └── modules/
├── docs/
│   ├── adr/
│   ├── integrations/
│   │   └── sapiom.md
│   ├── architecture.md
│   ├── reliability.md
│   ├── replay.md
│   ├── cost-controls.md
│   ├── observability.md
│   ├── security.md
│   ├── local-development.md
│   └── azure-deployment.md
├── scripts/
│   ├── demo.sh
│   ├── seed.ts
│   └── azure/
│       ├── estimate-or-explain-cost.sh
│       └── destroy.sh
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy-azure.yml      # Manually triggered only
├── .kiro/
├── docker-compose.yml            # Symlink or re-export of infra/local/docker-compose.yml
├── Makefile
├── pnpm-workspace.yaml
├── package.json
├── .env.example
├── .gitignore
├── README.md
└── LICENSE
```

## API Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/executions` | Create execution |
| GET | `/api/v1/executions` | List executions (paginated, filtered) |
| GET | `/api/v1/executions/:id` | Get execution detail |
| GET | `/api/v1/executions/:id/events` | Get execution event log |
| GET | `/api/v1/executions/:id/cost` | Get execution cost breakdown |
| GET | `/api/v1/executions/:id/artifacts` | List execution artifacts |
| GET | `/api/v1/executions/:id/trace` | Get trace correlation IDs |
| POST | `/api/v1/executions/:id/cancel` | Cancel execution |
| POST | `/api/v1/executions/:id/retry` | Manual retry (re-enqueue) |
| POST | `/api/v1/executions/:id/replay` | Replay execution (input or simulation) |
| GET | `/api/v1/dead-letter` | List dead-lettered executions |
| GET | `/api/v1/dead-letter/:id` | Get dead-letter detail |
| POST | `/api/v1/dead-letter/:id/requeue` | Requeue dead-lettered execution |
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/ready` | Readiness check |
| GET | `/metrics` | Prometheus metrics |

## Local Development Architecture

```mermaid
graph TD
  subgraph "Developer Machine"
    WEB["Web Dashboard\n:5173"]
    API["API Service\n:3000"]
    WORKER["Worker Process"]
  end

  subgraph "Docker Compose"
    PG["PostgreSQL 16\n:5432"]
    SBE["Service Bus Emulator\n:5672 AMQP\n:5300 HTTP"]
    MSSQL["SQL Server 2022\n(SBE dependency)"]
    AZ["Azurite\n:10000-10002"]
    OTEL["OTel Collector\n:4317 :4318"]
    PROM["Prometheus\n:9090"]
    TEMPO["Grafana Tempo\n:3200"]
    GRAF["Grafana\n:3000"]
  end

  WEB -->|REST| API
  API -->|Prisma| PG
  API -->|AMQP| SBE
  API -->|OTLP/HTTP| OTEL
  WORKER -->|Prisma| PG
  WORKER -->|AMQP| SBE
  WORKER -->|HTTP| AZ
  WORKER -->|OTLP/HTTP| OTEL
  SBE --> MSSQL
  OTEL --> PROM
  OTEL --> TEMPO
  GRAF -->|PromQL| PROM
  GRAF -->|TraceQL| TEMPO
```

## Optional Azure Deployment Architecture

```mermaid
graph TD
  subgraph "Azure"
    ACA_API["Container Apps\nAPI Service"]
    ACA_WORKER["Container Apps\nWorker"]
    ASB["Azure Service Bus\nStandard Tier"]
    ASTORAGE["Azure Blob Storage"]
    APGSQL["Azure DB for PostgreSQL\nFlexible Server"]
    AKV["Azure Key Vault"]
    AMONITOR["Azure Monitor\nApplication Insights"]
    ACR["Azure Container Registry"]
  end

  ACA_API -->|AMQP| ASB
  ACA_API -->|Prisma| APGSQL
  ACA_API -->|OTLP| AMONITOR
  ACA_WORKER -->|AMQP| ASB
  ACA_WORKER -->|Prisma| APGSQL
  ACA_WORKER -->|SDK| ASTORAGE
  ACA_WORKER -->|OTLP| AMONITOR
  ACA_API -->|Managed Identity| AKV
  ACA_WORKER -->|Managed Identity| AKV
  ACR -.->|image pull| ACA_API
  ACR -.->|image pull| ACA_WORKER
```

*Deployment requires `ALLOW_AZURE_DEPLOY=true`. See `docs/azure-deployment.md`.*
