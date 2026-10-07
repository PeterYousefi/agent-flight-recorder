# REST API

The API uses Fastify with a 1 MiB body limit, strict Zod request contracts, typed error responses and generated OpenAPI documentation at `/api/docs` (`/api/docs/json` for the schema). Runtime composition is supplied separately; importing `createApi` never opens a port.

JSON envelope fields use snake_case. Input, event payloads, metadata and artifact content retain their original keys. Currency records are integer micro-dollar strings, never database floats. Unknown measured cost is `null`, not zero.

Create with `POST /api/v1/executions`:

```json
{
  "agent_id": "demo",
  "provider": "mock",
  "operation": "success",
  "input": {},
  "budget_policy": {
    "max_cost_usd": 1,
    "max_duration_seconds": 60,
    "max_attempts": 3,
    "max_tool_calls": 10
  }
}
```

The default budget is the policy above. A supplied policy can omit individual limits. API limits are capped at $100, 3,600 seconds, ten attempts and 100 tool calls. Use `Idempotency-Key` or `idempotency_key` for durable creation deduplication. Different input with the same key returns 409; an identical repeat returns the same execution with 200. New requests return 202 and a Location header.

Execution list, event list and dead-letter list accept `limit` (1–100, default 25) and `offset` (default 0). Execution list also accepts a lifecycle `status`. Events always use sequence order. Responses expose `items` and `next_offset`.

Execution detail, events, cost and private artifact metadata/content are available under `/api/v1/executions/:id`. Actions are `cancel`, `retry` and `replay`. Retry creates an input replay from a failed terminal execution. Replay accepts `mode`, optional mock `scenario`, and `carry_budget`; simulation is the default. Dead letters are listed at `/api/v1/dead-letter`, with `POST /api/v1/dead-letter/:id/requeue` creating a new execution.

`health` reports process liveness; `ready` verifies dependencies and returns 503 when unavailable. Each response includes a generated `X-Request-Id`. Error envelopes contain a safe code/message/request_id without raw database errors, stack traces or credentials.

This v1 operator API has no authentication and must bind to loopback for local use. It must not be exposed publicly without authentication and authorization. CORS permits only the local frontend origins on port 5173. Blob storage keys and connection strings are never returned.
