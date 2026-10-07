# Replay

`ReplayService` creates a fresh execution, replay relationship and audit record in one transaction. The original execution is locked to verify terminal status, and its snapshot, events and audit records remain unchanged. Active executions cannot be replayed. Creation idempotency keys are dropped so replay is a new operation.

Input replay retains the original provider and inputs. External providers may produce different results and incur new charges. Simulation replay always persists `mock` as the provider and defaults to the `success` scenario. It performs no external calls. The optional scenario selects deterministic mock behavior; this is not a claim of reproducing historical external outputs.

Budgets carry over by default. Opting out uses conservative local defaults: $1, 60 seconds, three attempts and ten tool calls. Queue publication uses the same durable outbox as ordinary execution creation. Retry of a terminal execution is an input replay; automatic retries remain attempts inside the original execution.
