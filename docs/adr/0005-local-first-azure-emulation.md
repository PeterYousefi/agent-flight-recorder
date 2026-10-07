# ADR 0005 — Local-First Development with Azure Emulation

**Date:** 2026-10-06  
**Status:** Accepted

## Context

This is a portfolio project. The default development and demo experience must cost $0 in Azure credits. At the same time, the architecture must demonstrate genuine Azure competence — not just a collection of Docker containers with no cloud story.

The goal is: identical application code, identical SDK usage, different infrastructure underneath.

## Decision

**All Azure services are emulated locally via Docker. The application code uses Azure SDKs unchanged. Only connection strings differ between local and cloud environments.**

| Concern | Local (Docker) | Azure (optional, explicit opt-in) |
|---|---|---|
| Message queue | Azure Service Bus emulator (`mcr.microsoft.com/azure-messaging/servicebus-emulator`) | Azure Service Bus Standard/Premium |
| Object storage | Azurite (`mcr.microsoft.com/azure-storage/azurite`) | Azure Blob Storage |
| Secrets | `.env` file | Azure Key Vault (via `@azure/keyvault-secrets`) |
| Relational DB | `postgres:16-alpine` | Azure Database for PostgreSQL Flexible Server |
| Metrics | Prometheus | Azure Monitor (custom metrics via OTel exporter) |
| Traces | Grafana Tempo | Azure Monitor Application Insights (via OTel exporter) |
| Logs | stdout → OTel Collector | Azure Monitor Log Analytics (via OTel exporter) |
| API/Worker runtime | Local Node.js | Azure Container Apps |

## Rationale

### Why not mock the Azure SDKs

Mocking `@azure/service-bus` in tests provides unit test coverage, but it does not validate that the SDK usage is correct against the actual API. The emulators run the real protocol, which catches serialization bugs, message attribute handling issues, and connection management problems that mocks would miss.

### Why the Azure Service Bus emulator specifically

- Official Microsoft artifact — same team, same protocol.
- Supports queues, topics, subscriptions, dead-letter queues, and scheduled enqueue.
- Health check endpoint at `:5300/health` for Docker Compose dependency ordering.
- Uses `UseDevelopmentEmulator=true` in the connection string — the `@azure/service-bus` SDK switches to the emulator automatically.

**Known limitation:** The emulator requires a SQL Server Linux sidecar container. This adds ~500MB to the Docker Compose footprint. The alternative (in-memory broker) does not validate SDK usage. The tradeoff is accepted.

### Why Azurite for blob storage

- Official Microsoft artifact, maintained alongside the Azure Storage SDK.
- Supports Blob, Queue, and Table services.
- The `@azure/storage-blob` SDK connects to Azurite using the well-known development connection string: `UseDevelopmentStorage=true` / `DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;...`

### Why OpenTelemetry Collector as the local observability hub

- The OTel Collector acts as the local equivalent of Azure Monitor's ingestion pipeline.
- It receives OTLP signals and fans them out to Prometheus (metrics), Tempo (traces), and a local log sink.
- Replacing the collector's exporters with Azure Monitor exporters (via `@opentelemetry/exporter-metrics-otlp-http` pointed at Azure Monitor) is the only change needed for cloud deployment.
- Grafana dashboards work identically against Prometheus and Tempo locally.

## Infrastructure Layout

```
infra/
  local/
    docker-compose.yml          — complete local stack
    servicebus-config.json      — Service Bus emulator entity definitions
    otel-collector-config.yaml  — OTel Collector pipeline config
    prometheus.yml              — Prometheus scrape config
    grafana/
      dashboards/               — provisioned Grafana dashboards (JSON)
      datasources/              — Grafana datasource provisioning
  azure/
    main.bicep                  — top-level Bicep entry point
    modules/
      container-apps.bicep
      service-bus.bicep
      storage.bicep
      postgresql.bicep
      monitoring.bicep
```

## Azure Deployment Gate

No Azure IaC runs automatically. Every `scripts/azure/` script checks:

```bash
[ "${ALLOW_AZURE_DEPLOY}" = "true" ] || { echo "Set ALLOW_AZURE_DEPLOY=true to proceed"; exit 1; }
```

CI pipelines never set `ALLOW_AZURE_DEPLOY`. The deployment workflow in `.github/workflows/deploy-azure.yml` is manually triggered and requires repository secrets to be explicitly configured.

## Consequences

- Docker Desktop is a hard prerequisite. The local stack does not work without it.
- The SQL Server sidecar for the Service Bus emulator requires accepting Microsoft's EULA on first run (handled in `docker-compose.yml` via `ACCEPT_EULA=Y`).
- Developers on machines with less than 8GB RAM available to Docker may see performance degradation from the full stack. The `docker-compose.override.yml` approach can be used to run a minimal subset.
- Azurite does not implement 100% of Azure Blob Storage's API surface. Features beyond basic blob and container operations should be validated against real Azure before production use.
