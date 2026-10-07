# Dead letters and requeue

Permanent provider errors and exhausted retry policies finish the attempt, record `execution.failed`, then persist a dead-letter record and audit before the final `execution.dead_lettered` event. The snapshot transitions RUNNING → FAILED → DEAD_LETTERED in the same transaction. There is no partially terminal history visible between these writes.

A dead letter is historical evidence. Requeue creates a new PENDING execution with the original normalized request, strips the creation idempotency key, and records a separate `dead_letter_requeues` relationship plus an audit on the new execution. Scheduling follows normal durable orchestration. The original snapshot, event stream, dead-letter row and attempt history remain unchanged.

One dead letter can produce one requeued execution. Concurrent or repeated requeue requests return that execution, protected by the original execution lock and database uniqueness. Requeueing a subsequently failed execution is a separate operation on its new dead letter. Requeue does not fix provider inputs or guarantee success.

Cancelled and budget-exceeded executions do not become dead letters. Transport dead-lettering rejects malformed queue envelopes independently of execution dead letters.
