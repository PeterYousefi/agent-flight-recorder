# Demo Lab

Run `pnpm install --frozen-lockfile` and `pnpm demo` with Node 22+, pnpm 9 and Docker Desktop running. The command starts the local observability/emulator stack, builds the workspace, applies checked-in database migrations, starts the API/worker and serves the operations dashboard on http://localhost:5173. It forces Sapiom disabled and public local emulator connections, without reading application credentials from `.env`. Docker Compose's local infrastructure configuration remains local. Ctrl+C stops applications while named Docker data volumes remain intact.

The API catalog at `GET /api/v1/demo/scenarios` describes ten scenarios. `POST /api/v1/demo/scenarios/:scenario/run` returns a new queued mock execution with `synthetic_costs: true`. Supported IDs: success, transient_failure, rate_limit, timeout, budget_exceeded, budget_warning, permanent_failure, dead_letter, replay, cancellation.

A transient failure succeeds on attempt two. Rate limits honor the mock delay hint. Timeouts and repeated failures exhaust three attempts; permanent failures bypass retry. Budget overrun produces a synthetic measured charge above $0.01, while budget_warning estimates 80% of that limit. Cancellation creates a five-second mock operation so the operator can cancel it. Provider behavior and final outcomes are deterministic; wall-clock timing includes normal retry jitter and local scheduling.

Replay is a two-step workflow: the demo endpoint creates a successful source and returns `followup_replay: true`. After the source reaches SUCCEEDED, the client calls its replay endpoint with `mode: simulation`. The UI and verification script perform this sequence and navigate to the new execution. The original remains immutable. No API handler directly processes work or bypasses the queue.

Open the Demo Lab and run a scenario to inspect its live timeline, attempts, costs and artifacts. The default environment needs no Sapiom/OpenAI/Anthropic key, Azure account or paid service. All demo costs are synthetic values, not real spending.

If application ports 3000 or 5173 are in use, the launcher stops with an actionable message instead of attaching to an unknown running process. Stop the existing application and retry. Stop local containers with `docker compose --profile observability stop`; do not remove named volumes unless you intentionally want to erase local history.
