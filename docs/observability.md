# Observability

The API and worker start separate OpenTelemetry Node SDKs (`afr-api` and `afr-worker`) and send OTLP HTTP traces/metrics to the local collector. Only manual instrumentation is enabled. Environment/resource auto-detection is disabled. No SDK automatically captures SQL, HTTP headers, provider bodies or arbitrary request inputs.

HTTP handlers create a request span and an action span. Durable queue envelopes persist W3C `traceparent` during creation and retry scheduling. Publication extracts that context and creates a producer span; consumption creates a child consumer span. Worker processing, attempts, provider execution/estimation, artifacts, replay and requeue have spans. Immutable events store the active trace/span IDs in correlation metadata. Existing envelopes without trace context remain valid.

Persistence collects observations inside a transaction and emits them only after commit. Rollbacks and idempotency hits do not increment creation counters. Telemetry callback failures cannot invalidate committed application state. Counters are process observations, not a replacement for the authoritative PostgreSQL history, and can reset on process restart or omit a commit if a process dies before observation.

Metrics include executions_total, executions_succeeded_total, executions_failed_total, execution_duration_seconds, execution_retry_total, execution_replay_total, dead_letter_total, budget_rejections_total, estimated_execution_cost, measured_execution_cost, tool_invocation_total and provider_error_total. The collector adds the `afr_` prefix; Prometheus normalizes unit suffixes. Execution duration is wall time from the first persisted event through a final event. Costs are observed integer micro-dollar records converted to dollars for telemetry; the database retains exact integers. Mock charges are explicitly synthetic.

Structured logs are JSON with an allowlist of request/execution IDs, lifecycle facts, sequence, status and correlation IDs. Raw errors, input, output, credentials, connection strings and auth headers are never passed to the logger or span attributes. Trace errors use a generic description while preserving typed errors in application control flow. No sensitive baggage is propagated.

Start the local stack with `docker compose --profile observability up -d`. Grafana is on localhost:3001, Prometheus on localhost:9090 and Tempo on localhost:3200. This costs $0 in Azure. Telemetry export is best effort; execution processing does not depend on collector availability. Shutdown flushes telemetry and closes database/message clients.

Tests use in-memory OTel exporters to verify parent-child propagation, error sanitation and metrics. PostgreSQL tests verify rollback observations are discarded and telemetry failures cannot roll back committed work. Real collector/Tempo/Prometheus verification is performed in the local demo acceptance path.

## Provisioned dashboard

Grafana provisions `Agent Flight Recorder — Local Operations` in the AFR folder, with UID `afr-operations`. It uses measured collector metrics for creation rates, terminal outcomes, P50/P95 wall duration, retries, dead letters, provider failures, budget rejections, estimated/measured cost rates and queue publication/consumption/redelivery. Quiet series can have no data until an event is observed. Counters are process observations and restart with the API/worker.

Transport queue depth is unavailable because the emulator runtime-count response fails the SDK parser. The dashboard states that limitation and shows measured queue activity instead. Trace IDs from immutable events open the corresponding Tempo trace through Grafana Explore. No service-map metrics are claimed without a configured metrics generator.

Canonical configuration lives under `infra/local/`. Run `python3 scripts/local/sync-compose-config.py` after changing it; the script embeds the same files in Compose's startup heredocs. This preserves the Docker Desktop workflow without Desktop-folder bind mounts. `--check` detects drift and runs in CI. Grafana writes the dashboard JSON at startup, so new installations require no manual import. All host ports bind to 127.0.0.1.
