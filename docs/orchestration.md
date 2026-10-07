# Execution orchestration

`@afr/application` coordinates domain rules and infrastructure ports. `ExecutionOrchestrator` validates a request against the selected provider, creates it idempotently, then schedules it. `ProviderRegistry` rejects unavailable providers explicitly. No database client types enter this package.

Creation commits a PENDING snapshot, creation event and audit together. Scheduling locks the execution row, appends `execution.queued`, transitions the snapshot to QUEUED, and writes a message outbox record in one transaction. Concurrent submissions therefore produce one queue intent. If a process crashes between creation and scheduling, `recoverPending()` queues durable pending executions. Legacy snapshots without creation history are left untouched rather than fabricating history.

`OutboxDispatcher` publishes due outbox records, marking each only after transport acceptance. Transport failures preserve intent for a later tick. A crash after acceptance but before marking can publish a duplicate; processing must be idempotent. Publication is deliberately outside the database transaction. Multiple dispatchers can publish the same message; the outbox currently favors recoverability over minimizing duplicate publications.

Cancellation persists its event, snapshot and audit in one locked transaction. Repeated cancellation is idempotent. Domain transitions prohibit cancelling final executions. Recording CANCELLED does not imply an external provider stopped; the processor must discard late success and record attempt/cost outcomes appropriately. Providers with no cancellation capability must be labelled honestly.

Scheduling and outbox dispatch are explicit operations so process entry points can run bounded ticks and tests can inject time. Queued messages carry only execution identifiers; normalized request input stays in PostgreSQL.
