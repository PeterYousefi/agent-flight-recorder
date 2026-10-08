# Reliability model

Create uses canonical request fingerprints and durable unique idempotency keys. Equal requests return the existing execution across restarts; conflicting bodies return HTTP 409. Snapshot, creation fact, audit and durable outbox entries commit together. Outbox records are marked only after publication; duplicate publication remains possible and is expected.

The worker claims an execution/attempt under a PostgreSQL row lock and lease. Duplicate busy work is retried, stale/final envelopes are acknowledged, and expired leases enter the bounded retry policy. Provider calls have bounded deadlines. Facts are validated in sequence; a failed transaction persists none of its buffered telemetry observations.

Application retries use equal jitter, exponential capped delays, bounded server Retry-After hints, budgeted attempts and a maximum attempt count. Transport redelivery is separate from application retry. Terminal provider failures retain structured dead-letter reason/final attempt; requeue creates a linked new execution and leaves the historical record/events intact.

Replay is input or simulation. Input keeps the original provider/request; simulation explicitly selects MockProvider. Both use the regular queue/worker flow, allocate new IDs and append replay linkage only to the new execution. Original events and snapshot remain unchanged.

Budget admission checks estimated spend, wall duration, attempts and tool-call counts. Recorded measured spend uses exact integer micro-dollars. Warning thresholds and overruns are persisted facts. A provider can charge more than its estimate; already-started work cannot be made free by cancellation or a later budget rejection. Sapiom currently returns unknown pricing because no verified charge field is integrated.

Cancellation records a terminal state and is offered only for active work. The system cannot undo an external request. A late outcome can retain measured charge/artifact metadata and an audit without appending post-terminal state events.

Limits: this is not exactly-once external execution. A crash between provider response and PostgreSQL settlement can repeat a billable call unless the provider itself accepts an idempotency key. Blob upload before a failed database transaction can leave an orphan. Terminal history has no retention/archival service. Emulator settlement/counter behavior differs from cloud Service Bus. There is no multi-tenant/public API authorization. These are documented boundaries rather than guarantees inferred from successful local tests.
