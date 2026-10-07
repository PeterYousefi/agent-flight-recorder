# ADR 0006 — OpenTelemetry for Observability

**Date:** 2026-10-06  
**Status:** Accepted

## Context

AI agent executions cross multiple process boundaries: HTTP API → message queue → worker → execution provider. Understanding what happened during a failure requires traces that span these boundaries, not just logs from individual components.

Requirements:

- Distributed tracing across HTTP and async queue boundaries
- Structured metrics for executions, costs, retries, and dead letters
- Structured logs correlated to traces
- Local visualization without cloud credentials
- A clear path to Azure Monitor for production

## Decision

**OpenTelemetry SDK for all instrumentation. OTel Collector as the local signal aggregator. Prometheus + Grafana for metrics. Grafana Tempo for traces. Structured JSON logs with trace context.**

### SDK packages

```
@opentelemetry/sdk-node
@opentelemetry/auto-instrumentations-node   (HTTP, Fastify, pg, fetch)
@opentelemetry/exporter-trace-otlp-http
@opentelemetry/exporter-metrics-otlp-http
@opentelemetry/api
```

The OTel SDK is initialized before any application code in both `apps/api` and `apps/worker`.

### Context propagation across the queue boundary

When the API publishes a message to the Service Bus queue, it serializes the current OTel trace context into the message's `applicationProperties` using `propagation.inject()`. When the worker receives the message, it extracts the context using `propagation.extract()` and starts a child span. This connects the API trace to the worker trace into a single distributed trace.

```typescript
// Publishing (API side)
const carrier: Record<string, string> = {}
propagation.inject(context.active(), carrier)
message.attributes = { ...message.attributes, ...carrier }

// Consuming (Worker side)
const parentContext = propagation.extract(ROOT_CONTEXT, message.attributes)
const span = tracer.startSpan('worker.process_execution', {}, parentContext)
```

### Span naming convention

```
http.POST /api/v1/executions            — API request span
execution.create                        — execution creation logic
messagebus.publish executions           — queue publish
worker.process_execution                — top-level worker span
execution.transition {from} -> {to}     — state machine transitions
provider.execute {provider_name}        — provider invocation
provider.estimate_cost                  — cost estimation
artifact.persist                        — artifact storage
```

### Metrics

All metrics are defined in `packages/observability/src/metrics.ts`:

| Metric                           | Type      | Labels                            |
| -------------------------------- | --------- | --------------------------------- |
| `afr_executions_total`           | Counter   | `status`, `provider`              |
| `afr_executions_succeeded_total` | Counter   | `provider`                        |
| `afr_executions_failed_total`    | Counter   | `provider`, `failure_type`        |
| `afr_execution_duration_seconds` | Histogram | `provider`, `status`              |
| `afr_execution_retry_total`      | Counter   | `provider`, `attempt`             |
| `afr_execution_replay_total`     | Counter   | `mode`                            |
| `afr_dead_letter_total`          | Counter   | `provider`, `reason`              |
| `afr_budget_rejections_total`    | Counter   | `provider`, `policy_type`         |
| `afr_estimated_cost_usd`         | Histogram | `provider`                        |
| `afr_tool_invocations_total`     | Counter   | `provider`, `tool_name`, `status` |
| `afr_provider_errors_total`      | Counter   | `provider`, `error_type`          |
| `afr_queue_depth`                | Gauge     | `queue_name`                      |

All metrics are prefixed `afr_` (Agent Flight Recorder) to avoid collision in shared Prometheus instances.

### Local observability stack

```
apps/api, apps/worker
  → OTLP/HTTP → OTel Collector (localhost:4318)
                  → Prometheus exporter (localhost:9090) ← Grafana scrapes
                  → Tempo OTLP push (localhost:4317)    ← Grafana queries
                  → stdout exporter (structured logs)
```

Grafana (localhost:3000) has pre-provisioned datasources for Prometheus and Tempo, and pre-provisioned dashboards.

## Rationale

### Why OTel over direct Prometheus client

Direct Prometheus instrumentation would require replacing everything for Azure Monitor in production. OTel's vendor-neutral design means the same instrumentation code exports to Prometheus locally and to Azure Monitor (via the OTLP exporter) in production — only the collector configuration changes.

### Why Tempo over Jaeger or Zipkin

Grafana Tempo integrates natively with Grafana, making the traces/metrics/logs correlation (the "golden trio" of observability) work in a single Grafana UI. Jaeger requires a separate UI. Zipkin lacks the Grafana integration. Tempo also has a very small resource footprint suitable for local development.

### Why trace context in message attributes

W3C Trace Context propagation across async boundaries is the correct approach, and it is what production Azure Monitor integration expects. Embedding trace headers in message attributes is the standard OTel pattern for queue-based systems. This makes the distributed trace visible end-to-end in Grafana Tempo.

## Azure Production Mapping

In production, the OTel Collector's exporters are reconfigured:

- Traces: `otlp` exporter → Azure Monitor Application Insights
- Metrics: `prometheusremotewrite` or Azure Monitor metrics exporter
- Logs: `azuremonitorlogs` exporter

No application code changes are needed. Only `otel-collector-config.yaml` changes.

## Consequences

- The OTel SDK must be initialized at process entry before any imports that create spans.
- Auto-instrumentation covers HTTP and PostgreSQL automatically. Manual spans are added for business-logic boundaries (state transitions, provider calls, queue operations).
- Sensitive data (payloads, API keys) must never appear in span attributes. This is enforced by using only typed, pre-approved attribute keys.
- Tempo stores traces in memory by default in the local config — traces are not persisted across container restarts. This is acceptable for local development.
