# Agent Flight Recorder — Requirements

## Overview

Agent Flight Recorder is a local-first execution control plane for AI agent workloads. It wraps agent execution with durability, observability, cost governance, retry logic, dead-letter handling, and replay capabilities. The system is designed to demonstrate production-grade infrastructure patterns for AI agent operations.

---

## Functional Requirements

### FR-01: Execution Lifecycle Management

**FR-01.1** The system shall accept execution requests via `POST /api/v1/executions` and return a `202 Accepted` response with an `execution_id`.

**Acceptance criteria:**
- Response includes `execution_id` (UUID), `status: "PENDING"`, and `created_at`
- Request is persisted to the database before the response is returned
- A message is published to the execution queue before the response is returned
- If either DB write or queue publish fails, the request is rejected with an appropriate error

**FR-01.2** The system shall enforce a well-defined execution lifecycle with valid state transitions only.

**Acceptance criteria:**
- Valid states: `PENDING`, `QUEUED`, `RUNNING`, `WAITING`, `RETRY_SCHEDULED`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `BUDGET_EXCEEDED`, `DEAD_LETTERED`
- Invalid transitions are rejected and logged
- Every transition emits an `ExecutionEvent` with a monotonically increasing sequence number
- An execution in a terminal state (`SUCCEEDED`, `FAILED`, `CANCELLED`, `BUDGET_EXCEEDED`, `DEAD_LETTERED`) cannot transition to a non-terminal state
- State machine transitions are covered by unit tests for every valid and invalid transition

**FR-01.3** The system shall provide a structured event log for every execution.

**Acceptance criteria:**
- `GET /api/v1/executions/{id}/events` returns all events in sequence order
- Each event includes: `event_id`, `event_type`, `execution_id`, `timestamp`, `sequence`, `version`, `payload`
- Sequence numbers are monotonically increasing per execution and never skip
- Events are immutable — no update or delete operations exist

---

### FR-02: Asynchronous Worker Processing

**FR-02.1** A worker process shall consume execution messages from the queue and drive execution to completion.

**Acceptance criteria:**
- Worker processes one message at a time per queue consumer (configurable concurrency)
- Worker transitions execution through `QUEUED → RUNNING` before invoking the provider
- Worker handles provider success, retryable failure, and terminal failure paths correctly
- Worker emits structured log entries and OTel spans for every processing stage

**FR-02.2** The worker shall implement idempotent message processing.

**Acceptance criteria:**
- Processing the same message twice does not create a second execution or double-count cost
- An idempotency lock is acquired before state transition using `SELECT FOR UPDATE SKIP LOCKED`
- Duplicate messages are detected and acknowledged without reprocessing
- Idempotency is covered by concurrent integration tests

---

### FR-03: Execution Provider Abstraction

**FR-03.1** The system shall provide an `ExecutionProvider` interface that decouples execution logic from provider implementations.

**Acceptance criteria:**
- Interface defines: `validateRequest`, `estimateCost`, `execute`, `cancel`, `normalizeResult`, `healthCheck`
- No provider-specific types appear in domain or API packages
- Adding a new provider requires implementing the interface only — no changes to core execution logic

**FR-03.2** The system shall include a `MockProvider` with configurable failure injection.

**Acceptance criteria:**
- MockProvider supports scenarios: `success`, `timeout`, `transient_failure`, `permanent_failure`, `slow_response`, `malformed_response`, `budget_exceeded_scenario`, `rate_limited`
- Scenarios are selected via the execution request's `metadata.mock_scenario` field
- MockProvider is the default when `SAPIOM_API_KEY` is not set
- MockProvider cost estimates are configurable per scenario

**FR-03.3** The system shall include a `SapiomProvider` that wraps `@sapiom/tools`.

**Acceptance criteria:**
- SapiomProvider uses `createClient({ apiKey: process.env.SAPIOM_API_KEY })` from `@sapiom/tools`
- If `SAPIOM_API_KEY` is absent, SapiomProvider initialization fails gracefully and MockProvider is used
- Only documented, verified `@sapiom/tools` methods are called — no fabricated API methods
- `docs/integrations/sapiom.md` documents exactly which SDK methods are used and their limitations

---

### FR-04: Idempotency

**FR-04.1** Execution creation shall support an idempotency key.

**Acceptance criteria:**
- Client may include `idempotency_key` in the request body
- Submitting the same key twice within the idempotency window returns the original execution (200 OK) without creating a duplicate
- The response on a duplicate request is identical in shape to the original
- Concurrent identical requests resolve to one execution (no race condition creates two)
- Idempotency behavior is documented in `docs/reliability.md`

---

### FR-05: Retry Policy

**FR-05.1** The worker shall retry failed executions according to the execution's budget policy.

**Acceptance criteria:**
- Retries use exponential backoff with configurable jitter
- Default: base delay 1s, multiplier 2x, jitter ±20%, max delay 60s
- `max_attempts` from the budget policy is enforced — retries stop at exhaustion
- Each attempt is recorded in `execution_attempts` with its own start/end/error
- Retryable errors are explicitly classified — non-retryable errors skip retries
- `execution.retry_scheduled` event is emitted with attempt number and next attempt time
- Retry exhaustion leads to `FAILED` → `DEAD_LETTERED` transition

---

### FR-06: Dead-Letter Handling

**FR-06.1** Executions that exhaust retries or encounter terminal errors shall be dead-lettered.

**Acceptance criteria:**
- Dead-lettered executions appear in `GET /api/v1/dead-letter`
- Each dead-letter record includes: `execution_id`, `reason`, `final_error`, `attempt_count`, `dead_lettered_at`
- `GET /api/v1/dead-letter/{id}` returns full execution detail including event history
- `POST /api/v1/dead-letter/{id}/requeue` moves the execution back to PENDING and re-enqueues it
- Requeue creates an `audit_record` with `dead_letter.requeued` type
- Dead-letter count is visible on the overview dashboard

---

### FR-07: Cancellation

**FR-07.1** A running or queued execution shall be cancellable.

**Acceptance criteria:**
- `POST /api/v1/executions/{id}/cancel` returns `202 Accepted`
- Worker detects the cancel signal and transitions to `CANCELLED`
- Attempting to cancel a terminal execution returns `409 Conflict`
- `execution.cancelled` audit record is created

---

### FR-08: Cost Governance

**FR-08.1** Every execution shall have a budget policy with enforceable limits.

**Acceptance criteria:**
- Budget policy fields: `max_cost_usd`, `max_duration_seconds`, `max_attempts`, `max_tool_calls`
- Estimated cost is computed before execution begins via `provider.estimateCost()`
- If estimated cost exceeds `max_cost_usd`, execution transitions to `BUDGET_EXCEEDED` before provider is called
- If execution duration exceeds `max_duration_seconds`, execution is terminated and transitions to `BUDGET_EXCEEDED`
- `budget.warning` event is emitted at 80% of `max_cost_usd`
- `budget.exceeded` event is emitted when the limit is reached
- Estimated cost is clearly distinguished from measured cost in the data model and UI

**FR-08.2** Cost records shall be persisted per execution.

**Acceptance criteria:**
- `GET /api/v1/executions/{id}/cost` returns `{ estimated_usd, measured_usd, currency, breakdown }`
- Measured cost is only populated when the provider reports actual spend
- Costs are never negative
- Overview dashboard shows aggregate estimated cost

---

### FR-09: Replay

**FR-09.1** A historical execution shall be replayable in two modes.

**Acceptance criteria:**
- `POST /api/v1/executions/{id}/replay` accepts `mode: "input" | "simulation"`
- Input replay creates a new execution with the original's normalized input, using configured providers
- Simulation replay creates a new execution that forces `MockProvider`
- Original execution is never modified
- New execution has `original_execution_id` set and a `replays` record linking both
- `execution.replayed` event appears in both original and new execution event logs
- Replaying a non-terminal execution returns `409 Conflict`

---

### FR-10: Artifact Storage

**FR-10.1** Large execution artifacts shall be stored in object storage, not in the database.

**Acceptance criteria:**
- Artifacts (request payloads >4KB, normalized tool outputs, debug snapshots) are stored in Azurite locally
- `artifacts` table stores metadata: `execution_id`, `artifact_type`, `storage_key`, `size_bytes`, `created_at`
- `GET /api/v1/executions/{id}/artifacts` returns artifact metadata list
- No artifact bytes are stored in the PostgreSQL database

---

### FR-11: Observability

**FR-11.1** Every execution shall produce OTel traces spanning API → queue → worker → provider.

**Acceptance criteria:**
- Trace context propagates via message attributes across the queue boundary
- Worker starts a child span, not a new root span, when a parent context is present
- Spans exist for: HTTP request, execution creation, queue publish, queue consume, state transitions, provider call, artifact storage
- All spans include `execution_id` and `provider` as attributes
- Traces are visible in Grafana Tempo at `localhost:3000`

**FR-11.2** The system shall emit the defined set of OTel metrics.

**Acceptance criteria:**
- All 11 metrics defined in ADR-0006 are emitted with correct labels
- Metrics are visible in Grafana at `localhost:3000`
- At least one Grafana dashboard is pre-provisioned showing execution health

---

### FR-12: REST API

**FR-12.1** The API shall conform to the defined endpoint specification.

**Acceptance criteria:**
- All endpoints defined in the design document are implemented
- OpenAPI documentation is available at `GET /api/docs`
- Request body validation uses Zod schemas — invalid requests return `400` with field-level errors
- All responses use the standard error shape: `{ error: { code, message, request_id, details } }`
- Pagination is implemented on list endpoints (`limit`, `offset`, `total`)
- Stack traces are never returned in API responses
- `GET /api/v1/health` returns service health status
- `GET /api/v1/ready` returns readiness (DB connected, queue connected)
- `GET /metrics` returns Prometheus-format metrics

---

### FR-13: Operations Dashboard

**FR-13.1** A React dashboard shall provide operational visibility.

**Acceptance criteria:**
- Overview page: total executions, success rate, failure rate, P50/P95 duration, estimated cost, dead-letter count
- Executions list: filterable by status, provider, date range; shows ID, status, provider, duration, attempts, cost
- Execution detail: lifecycle timeline, attempt list, event log, cost breakdown, trace ID link, retry/replay buttons
- Dead-letter page: inspectable failures with requeue action
- Demo Lab page: launch deterministic scenarios (success, transient failure, budget exceeded, timeout, dead-letter, replay)

---

## Non-Functional Requirements

### NFR-01: Zero Azure Cost by Default
The complete system must operate locally without any Azure subscription, credentials, or spend. See `cost-guardrails.md`.

### NFR-02: Test Coverage
- All state machine transitions: unit tested
- All budget policy boundaries: unit tested
- Retry decisions (retryable vs non-retryable): unit tested
- Idempotency under concurrent requests: integration tested
- API validation and error responses: tested
- Worker end-to-end flow: integration tested

### NFR-03: Security
- No credentials in source code
- `.env` in `.gitignore`
- Input validation on all HTTP endpoints
- Sensitive payloads redacted in logs and traces
- Dependency audit in CI

### NFR-04: Documentation
- README with 5-minute setup
- All ADRs completed
- `docs/integrations/sapiom.md` honest about limitations
- OpenAPI documentation generated from code
