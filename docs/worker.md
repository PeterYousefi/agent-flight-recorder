# Asynchronous execution processing

`startWorker` subscribes an `ExecutionProcessor` to the injected MessageBus. The processor loads the durable request, claims an attempt in a transaction, performs provider work outside database locks, and commits completion with ordered events, attempt outcomes, costs and artifact metadata.

The processor is split into claim, budget admission and result recording services. Each reuses domain factories, event validation, budget evaluation and lifecycle rules. Provider invocation emits tool facts that can be grouped by attempt in the Flight Recorder.

## Duplicate delivery and crashes

A row lock serializes claims. A duplicate message for a running, unexpired attempt requests transport retry; messages for completed executions acknowledge without another provider call. Attempt IDs fence completion: a stale worker cannot overwrite a finished attempt. Expired leases preserve the previous attempt as failed and permit a new claim, with retry facts in history.

A database crash rolls back partial history. A crash after an external side effect can still repeat that effect: the provider receives an execution-scoped idempotency key, but external exactly-once execution requires provider support. Artifact writes precede the completion transaction, so crashes can leave unreferenced artifacts; retention cleanup is future work. A worker holding a lease does not hold a database transaction open during provider work.

## Budgets and cancellation

Admission checks attempts, tool calls, duration and projected cost. Cost records use integer micro-dollars. Estimates are recorded only when supplied; measured charges are recorded only when supplied. Measured amounts replace estimates for that attempt when evaluating cumulative usage. Estimates crossing the warning threshold create budget facts. An estimated overrun blocks provider invocation; a measured overrun after completion is captured as BUDGET_EXCEEDED.

Cancellation wins under the same execution lock. Late provider success cannot append facts after the final cancellation event. Its measured charge is retained, its attempt finishes CANCELLED, and an audit records the discarded result. This does not guarantee that an external side effect was stopped.

Provider exceptions are normalized to safe errors without persisting raw exception text. Retry scheduling and deadline handling are added by the bounded retry engine; this processor milestone captures permanent failures as FAILED.
