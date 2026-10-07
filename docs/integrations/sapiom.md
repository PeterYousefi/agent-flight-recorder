# Sapiom Integration

## What Sapiom Is

Sapiom is an AI agent execution platform. It provides:

- A typed agent authoring SDK (`@sapiom/agent`) for defining step-graph agents
- A capability client (`@sapiom/tools`) for invoking tools (sandboxes, coding models, search, file storage, etc.)
- A deployment and scheduling CLI (`@sapiom/cli`)
- A model router with smart routing across 400+ models

Sapiom abstracts away vendor accounts, API keys, and billing — agents call tools through a single Sapiom API key with pay-per-use semantics.

## What Agent Flight Recorder Uses

Agent Flight Recorder integrates with Sapiom via `@sapiom/tools` in the `SapiomProvider`.

### SDK package

```
@sapiom/tools (v0.x beta)
```

### Authentication

```typescript
import { createClient } from '@sapiom/tools'

const client = createClient({ apiKey: process.env.SAPIOM_API_KEY })
```

The `apiKey` is a Sapiom API key from the Sapiom console. It is optional — when absent, `SapiomProvider` logs a warning and the system falls back to `MockProvider` automatically.

### What we call

The `SapiomProvider` maps an `ExecutionRequest` to a Sapiom tool call based on the `operation` field:

| `operation` value   | `@sapiom/tools` call                                | Description                       |
| ------------------- | --------------------------------------------------- | --------------------------------- |
| `models.coding.run` | `client.models.coding.run({ task, gitRepository })` | Run a coding model against a repo |
| `search.web`        | `client.search.web({ query })`                      | Web search capability             |
| `sandboxes.run`     | `client.sandboxes.run({ code, language })`          | Code sandbox execution            |

These map to documented capabilities in `@sapiom/tools`. We call only methods we have verified exist in the published SDK.

### What we do NOT call

We do not call any `@sapiom/tools` method for:

- Querying execution status or history
- Retrieving per-execution cost data
- Setting budget policies
- Cancelling in-flight executions
- Replaying executions
- Emitting traces or structured events

These capabilities do not exist in Sapiom's public SDK as of October 2026. They are what Agent Flight Recorder provides as a complementary layer.

## What Agent Flight Recorder Adds

When a Sapiom tool call flows through the control plane, it gains:

| Capability              | Provided by                            |
| ----------------------- | -------------------------------------- |
| Durable execution state | Agent Flight Recorder (PostgreSQL)     |
| Structured event log    | Agent Flight Recorder                  |
| Budget enforcement      | Agent Flight Recorder (`BudgetPolicy`) |
| Retry with backoff      | Agent Flight Recorder (worker)         |
| Dead-letter handling    | Agent Flight Recorder                  |
| Replay                  | Agent Flight Recorder                  |
| OTel distributed traces | Agent Flight Recorder                  |
| Prometheus metrics      | Agent Flight Recorder                  |
| Operational dashboard   | Agent Flight Recorder                  |

None of these exist in Sapiom's public API surface. This is additive infrastructure, not duplication.

## Honest Limitations

**SDK is in v0.x beta.** The `@sapiom/tools` API may change before v1.0.0. If a method signature changes, `SapiomProvider` will need to be updated. This is expected for beta software.

**No measured cost data.** Sapiom charges per use, but `@sapiom/tools` does not currently return cost data in tool call responses. `SapiomProvider` reports `estimated_usd` only, using a configurable rate table. `measured_usd` remains null when using Sapiom. This is documented clearly in cost records and the UI.

**No execution status API.** Sapiom runs agents on its own infrastructure. There is no public API to poll the status of a running Sapiom agent from outside. `SapiomProvider.execute()` is synchronous from the worker's perspective — it awaits the tool call result and handles the response.

**No cancellation API.** `SapiomProvider.cancel()` logs a warning and returns — Sapiom does not expose a public cancellation endpoint. If a Sapiom tool call is in flight when a cancel is requested, the execution waits for the tool call to complete before transitioning to CANCELLED.

## Running Without Sapiom Credentials

The system works completely without `SAPIOM_API_KEY`. When the key is absent:

1. `SapiomProvider` initialization emits a warning log
2. The provider registry falls back to `MockProvider`
3. All executions use MockProvider (deterministic, configurable scenarios)
4. Demo, tests, and dashboard all work normally

To verify MockProvider is active:

```bash
GET /api/v1/health
# Response includes: "default_provider": "mock"
```

## Future Integration Opportunities

These capabilities would enhance the integration if Sapiom exposes them publicly in a future SDK version:

- **Execution status streaming** — real-time step-level status from Sapiom's agent runtime
- **Measured cost reporting** — actual spend per tool call from Sapiom's billing API
- **Agent deployment integration** — trigger `@sapiom/cli agents deploy` as part of the execution workflow
- **Spend governance bridging** — Sapiom has its own wallet/budget concept; bridging Agent Flight Recorder's `BudgetPolicy` with Sapiom's native spend controls would provide defense-in-depth

Each of these would require verified public API endpoints before implementation.
