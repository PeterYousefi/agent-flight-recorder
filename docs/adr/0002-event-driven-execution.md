# ADR 0002 — Event-Driven Execution Architecture

**Date:** 2026-10-06  
**Status:** Accepted

## Context

The core question is whether execution should be **synchronous** (API waits for the provider to finish and returns the result) or **asynchronous** (API accepts the request, hands it off, and the caller polls or subscribes for the result).

AI agent executions are inherently long-running and unpredictable in duration. A Sapiom coding model run could take seconds or minutes. A tool invocation hitting an external API could stall on rate limits. Holding an HTTP connection open for minutes is fragile and does not scale.

## Decision

**Asynchronous, event-driven execution.**

The API accepts a request, persists it, publishes a message to a queue, and returns `202 Accepted` with the `execution_id`. The worker independently consumes the queue, drives the execution, and persists state transitions as events. The caller polls `GET /api/v1/executions/{id}` or retrieves the event log.

All execution state transitions are recorded as immutable `ExecutionEvent` records. The event log is the authoritative record of what happened and when.

## Execution Flow

```
Client
  → POST /api/v1/executions
  → API validates request
  → API writes Execution (status: PENDING) + ExecutionEvent(execution.created)
  → API publishes { executionId } to "executions" queue
  → API returns 202 { execution_id, status: "PENDING" }

Worker (independent process)
  → consumes message from "executions" queue
  → acquires idempotency lock on execution_id
  → transitions: PENDING → QUEUED → RUNNING (with events)
  → invokes ExecutionProvider.execute()
  → on success: RUNNING → SUCCEEDED + cost record + events
  → on retryable error: RUNNING → RETRY_SCHEDULED → re-publish with delay
  → on terminal error (retries exhausted): RUNNING → FAILED → DEAD_LETTERED
  → on budget exceeded: RUNNING → BUDGET_EXCEEDED
  → on cancel signal detected: RUNNING → CANCELLED
```

## Rationale

### Durability

If the worker crashes mid-execution, the message remains in the queue (unacked) and will be redelivered. The execution's last persisted state allows the worker to resume correctly rather than silently losing work.

### Retry architecture

Retries are implemented as re-enqueue with a delay, not as in-process loops. This means:
- The worker process does not block waiting for a retry window
- Retry state is durable — a worker restart does not lose retry context
- Exponential backoff is implemented at the queue scheduling level

### Observability

Because every state transition emits an `ExecutionEvent`, the complete execution history is always available. There is no "we only know the final outcome" problem. The event log supports replay, debugging, and audit trails.

### Separation of concerns

The API is a thin ingestion layer. It does not understand provider behavior, retry logic, or budget enforcement. The worker owns execution semantics. This separation means the API can scale independently of execution throughput.

## Rejected Alternatives

**Synchronous HTTP (long-poll):**  
Fragile for long-running operations. HTTP timeouts, load balancer timeouts, and connection limits make this unsuitable for operations that may run for minutes. Does not support retry or dead-letter semantics naturally.

**WebSocket streaming:**  
Appropriate for streaming results to a UI, but not for the worker-to-API execution control path. Adds complexity without solving the durability problem.

**In-process async (Promise-based, no queue):**  
Fast for unit tests but not durable. A process crash loses all in-flight work. Retry logic becomes tangled with execution logic. Not representative of production agent infrastructure.

## Consequences

- Callers must poll for results rather than receiving them synchronously. This is explicitly documented in the API contract.
- The event log is the source of truth. Any state derived from it (current status, cost total, attempt count) must be derivable from the event sequence.
- Workers must be idempotent — the same message may be delivered more than once.
- A cancel signal must be detectable by the worker between execution steps, not just at queue consumption time.
