# ADR 0007 — Replay Semantics

**Date:** 2026-10-06  
**Status:** Accepted

## Context

Replay is one of the core differentiating features of Agent Flight Recorder. When an execution fails — or even when a successful execution needs to be re-examined — the ability to re-run it with its original inputs is essential for incident investigation and debugging.

However, "replay" is ambiguous. It can mean:

1. "Run the same input again against live providers" (simple retry with original input)
2. "Re-run deterministically against mocks for investigation" (simulation)
3. "Reproduce the exact sequence of events bit-for-bit" (true deterministic replay)

Option 3 is impossible when external providers are involved. We must be honest about this.

## Decision

**Two replay modes, both clearly defined and documented. Neither mode modifies the original execution.**

### Mode 1: Input Replay

Creates a new execution using the same normalized input from the original. The new execution goes through the full lifecycle — queue, worker, live provider — as if it were submitted fresh. Budget policy from the original is optionally carried over.

- Original execution: unchanged, status stays as-is
- New execution: fresh `execution_id`, `status: PENDING`, linked via `replays` table
- Provider: whichever provider is configured (live Sapiom, mock, etc.)
- Use case: re-running a failed execution after fixing an upstream issue

### Mode 2: Simulation Replay

Creates a new execution using the same normalized input, but forces `MockProvider` as the provider regardless of the original provider. The mock scenario can be configured (default: success).

- Original execution: unchanged
- New execution: fresh `execution_id`, marked with `replay_mode: simulation`, linked via `replays` table
- Provider: always `MockProvider`
- Use case: investigating execution behavior without triggering real provider calls or incurring real costs

### What we explicitly do not claim

We do not claim bit-for-bit deterministic replay. External providers (Sapiom, LLM APIs, search tools) are non-deterministic. The same input sent twice will produce similar but not identical outputs. Replay recreates the execution _context_ — inputs, budget, configuration — not the exact bytes of every response.

This distinction is documented in the API contract, the UI, and `docs/replay.md`.

## Data Model

```sql
-- replays table
id                  UUID PRIMARY KEY
original_execution_id  UUID REFERENCES executions(id) NOT NULL
replay_execution_id    UUID REFERENCES executions(id) NOT NULL
mode                   TEXT NOT NULL  -- 'input' | 'simulation'
initiated_by           TEXT           -- actor identifier
created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
```

The `ExecutionEvent` for the replay includes:

```json
{
  "event_type": "execution.replayed",
  "payload": {
    "original_execution_id": "...",
    "replay_mode": "input | simulation",
    "replay_execution_id": "..."
  }
}
```

Both the original and new execution have `execution.replayed` events pointing at each other. The event on the original records that it was replayed. The event on the new execution records its origin.

## API Contract

```
POST /api/v1/executions/{id}/replay

Request body:
{
  "mode": "input" | "simulation",
  "scenario": "success" | "timeout" | "transient_failure" | ...  // simulation mode only
  "carry_budget": boolean  // whether to use original's budget policy
}

Response: 202 Accepted
{
  "replay_execution_id": "...",
  "original_execution_id": "...",
  "mode": "input | simulation"
}
```

## Rejected Alternatives

**Mutating the original execution for replay:**  
Never. The original execution record is the authoritative record of what happened. Mutating it would corrupt the audit trail. A replay creates a new execution that references the original.

**Single replay mode:**  
A single "re-run" mode conflates two distinct use cases. Simulation replay is essential for local demo and incident investigation without real provider calls. Input replay is essential for production re-processing. They need different UI affordances and different behavior.

**Storing full provider responses for exact replay:**  
Storing complete provider responses would allow "exact replay" from stored outputs rather than re-executing. This would be valuable but adds significant storage and privacy complexity. It is noted as a future improvement but not implemented in v1. The `artifacts` table provides a foundation for this.

## Consequences

- The UI must clearly label replayed executions and link them to their origin.
- The replay endpoint must validate that the original execution is in a terminal state (SUCCEEDED, FAILED, CANCELLED, BUDGET_EXCEEDED, DEAD_LETTERED) before allowing replay. Replaying a RUNNING execution is rejected.
- Simulation replay must never use a real provider. The worker must check the `replay_mode` attribute on the message and override the provider selection.
- Costs incurred by input replay are real (if using a real provider). This must be visible in the UI and documented.
