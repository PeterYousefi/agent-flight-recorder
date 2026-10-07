# ADR 0004 — PostgreSQL and Prisma for Persistence

**Date:** 2026-10-06  
**Status:** Accepted

## Context

The system needs a relational store for:

- Execution lifecycle state (current status, idempotency key, budget policy)
- Ordered event logs (monotonic sequence per execution)
- Attempt records (start/end timestamps, error details, attempt number)
- Cost records (estimated vs measured, per execution and per attempt)
- Dead-letter queue metadata
- Audit records
- Replay relationship links
- Artifact metadata

Requirements:

- Strong consistency for state transitions (optimistic locking or SELECT FOR UPDATE)
- Ordered queries by `created_at`, `sequence`, `status`
- Idempotency key lookups (unique constraint + index)
- Full local operation without cloud credentials
- A migration system with committed history

## Decision

**PostgreSQL 16 in Docker for local development. Prisma ORM for schema management, migrations, and the TypeScript client.**

## Rationale

### PostgreSQL

- The de facto standard for production relational workloads. No need to justify this.
- JSON/JSONB columns for flexible payload storage (execution input, event payload, error details) without losing the ability to index into them.
- `FOR UPDATE SKIP LOCKED` for idempotency lock acquisition in the worker — this is the correct pattern for queue-like processing without a separate lock service.
- Window functions for computing monotonic event sequences efficiently.
- Excellent Docker support — the official `postgres:16-alpine` image is small, fast, and production-equivalent.

### Prisma

- Schema-first migrations. Every migration is a committed SQL file with a clear before/after. This is auditable and reviewable.
- Generated TypeScript client gives complete type safety on queries without manual typing.
- Prisma's `@db.Text` and `Json` types map cleanly to PostgreSQL's native types.
- The Prisma client supports connection pooling via PgBouncer, which matters for the Azure Container Apps deployment path.

### Why not Drizzle ORM

Drizzle is a strong alternative with a lighter footprint. Chose Prisma because:

- Prisma's migration tooling is more mature and the history model (committed migration files) is more appropriate for a portfolio project where the schema evolution should be visible.
- Prisma's generated client has better IDE completion for complex queries.
- Drizzle would be a valid choice for a greenfield project prioritizing performance over migration ergonomics.

### Why not TypeORM

TypeORM's decorator-based schema definition couples the schema to the class definition, making it harder to see the full schema at a glance. Its migration tooling has historically been less reliable than Prisma's. Not chosen.

### Why not SQLite

SQLite lacks `SELECT FOR UPDATE`, which is needed for the idempotency lock pattern. It also does not support concurrent writers well, which would be a problem as the worker scales. Not appropriate for the execution control plane.

## Schema Design Principles

- All primary keys are UUIDs (`gen_random_uuid()`), not auto-increment integers.
- `created_at` and `updated_at` on all tables, set by the database default/trigger.
- Idempotency keys have a unique index.
- `execution_events.sequence` is a monotonically increasing integer per `execution_id`, enforced by the application layer and verified in tests.
- Event payload and execution input are stored as `JSONB` for efficient partial queries.
- No soft deletes — records are immutable or explicitly terminal (dead-lettered, cancelled).

## Indexes (explicit, justified)

| Table              | Index                      | Reason                                 |
| ------------------ | -------------------------- | -------------------------------------- |
| `executions`       | `status`                   | Filter by status on overview dashboard |
| `executions`       | `created_at`               | Time-range queries                     |
| `executions`       | `provider`                 | Filter by provider                     |
| `executions`       | `idempotency_key` (unique) | Idempotency deduplication              |
| `execution_events` | `(execution_id, sequence)` | Ordered event log retrieval            |
| `execution_events` | `event_type`               | Filter events by type                  |
| `dead_letters`     | `created_at`               | Dead-letter queue ordered inspection   |
| `audit_records`    | `execution_id`             | Per-execution audit trail              |

## Azure Mapping

In production, PostgreSQL maps to **Azure Database for PostgreSQL Flexible Server**. The connection string in `.env` is the only change required. Prisma migrations run as a deployment step (`prisma migrate deploy`), not during application startup.

## Consequences

- The Docker Compose setup must include a PostgreSQL service with a health check before the API or worker starts.
- Prisma migrations must be run before the first application start: `pnpm prisma migrate deploy`.
- The `DATABASE_URL` environment variable format must be set correctly for both local and Azure deployments.
- Schema changes require a new Prisma migration file — `prisma db push` is prohibited in production paths.

## Initial Schema Implementation Notes

The T-10 Prisma schema persists the execution snapshot separately from immutable
execution events, attempts, costs, artifacts, replay relationships, dead-letter
records, and audit records. Status and event type columns remain text values so
the domain can evolve without coupling every new lifecycle value to a database
enum migration.

- Event order is protected by `UNIQUE (execution_id, sequence)`; assigning the
  next sequence transactionally remains a repository concern.
- Request idempotency is protected by a unique nullable `idempotency_key`.
- Monetary values are stored as non-negative `BIGINT amount_micro_usd` values,
  matching the domain evaluator's integer micro-dollar comparisons.
- Replay relationships use a unique replay execution ID and a database check
  preventing an execution from replaying itself.
- Historical foreign keys use restrictive deletion. A dead-lettered execution
  remains historical and requeue relationships point to a new execution.
- Database checks enforce structural facts such as positive sequences/counts and
  non-negative money/byte sizes. The domain layer remains authoritative for the
  legal execution state machine and event semantics.
