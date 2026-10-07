# PostgreSQL persistence

PostgreSQL is the durable source of truth. Prisma is contained in `packages/persistence`; domain ports return domain records, never generated client types. Execution snapshots persist normalized inputs so workers and replay can recover requests without relying on queue payloads.

`PostgresExecutionStore.transaction(executionId, callback)` locks the execution row and commits callback writes together. Use it to append events, change snapshots, finish attempts, record costs, and write audit records as one unit. Never perform provider calls or queue publication inside a database transaction. Snapshot updates compare the expected status and reuse the domain lifecycle validator.

Event appends validate the existing stream with the domain validator. Per-execution row locking serializes concurrent appends; `(execution_id, sequence)` uniqueness remains the final database protection. Reads order by sequence, never timestamp. History has no update or deletion methods. Costs use bigint micro-dollars; API serialization must encode these as decimal strings.

Attempt completion is conditional on RUNNING and cannot overwrite a finished attempt. Cost attribution verifies the attempt belongs to the same execution. Replay relationships and dead-letter records reference separate executions. These adapters provide persistence; orchestration is responsible for coordinating lifecycle events and snapshots.

## Local migrations

Set `DATABASE_URL` to the local database, then run:

```sh
pnpm --filter @afr/persistence prisma:generate
pnpm --filter @afr/persistence prisma:migrate:deploy
```

## Integration tests

Use a separate local database, such as `afr_integration_test`. Tests are enabled only with `AFR_TEST_DATABASE_URL`; setting the application `DATABASE_URL` alone never enables cleanup. Cleanup deletes only IDs created by each suite.

```sh
DATABASE_URL="$AFR_TEST_DATABASE_URL" pnpm --filter @afr/persistence prisma:migrate:deploy
pnpm --filter @afr/domain build
pnpm --filter @afr/persistence test:integration
```

Tests cover actual database constraints, normalized request round trips, transaction rollback, concurrent appends, stale snapshots, exact bigint costs, attempt ownership, and relationship persistence. Normal workspace tests skip these suites when the test URL is absent.

Current limitations: offset pagination is capped at 100 records; event append validation reads the execution's history. This favors correctness for the initial release. A durable outbox and worker claim/lease are subsequent application reliability work.

## Durable creation idempotency

`createExecutionIdempotently` commits the initial snapshot, creation event, request fingerprint, and audit record together. A unique idempotency key is the final arbiter under concurrency, including across distinct database clients. Repeating a key with the same normalized JSON request returns the original execution; changing input, provider, operation, agent, budget or metadata returns a conflict. SHA-256 fingerprints canonicalize object key order while preserving array order. Keys accept 1–128 ASCII letters, digits, dots, underscores, colons and hyphens. Missing keys create independent executions. Legacy keys without fingerprints fail closed on reuse.

Keys are currently global to this local control plane. Multi-tenant deployments need an authenticated tenant scope in the uniqueness constraint. No provider call or message publication occurs during this creation transaction; durable scheduling is orchestration work.
