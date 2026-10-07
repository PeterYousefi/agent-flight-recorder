---
inclusion: always
---

# Cost Guardrails

## The Prime Directive

**Normal project operation must consume $0 in Azure credits.**

This is not a goal. It is a hard constraint. Every architectural decision must be evaluated against it.

## What This Means in Practice

The complete development and demo experience runs on:

- Local machine
- Docker Desktop
- Azure emulators (Azurite, Service Bus emulator) running inside Docker
- Open-source observability stack (OTel Collector, Prometheus, Grafana, Tempo) running inside Docker

No Azure subscription is required. No Azure resource is created. No Azure credit is consumed.

## Prohibited Actions During Normal Operation

The following commands must NEVER execute automatically during:

- `docker compose up`
- `make dev`, `make test`, `make demo`
- CI pipeline runs
- Any Kiro task execution
- Any script that runs without explicit human opt-in

```
terraform apply
az deployment create / group create
az group create
azd up
az containerapp create
az aks create
az cosmosdb create
az servicebus namespace create
az storage account create
az keyvault create
az monitor workspace create
az cognitiveservices account create (OpenAI)
```

## The Opt-In Gate

Azure deployment is gated behind an explicit environment variable:

```bash
ALLOW_AZURE_DEPLOY=true
```

Every script in `scripts/azure/` must check this variable at the top:

```bash
if [ "${ALLOW_AZURE_DEPLOY}" != "true" ]; then
  echo "ERROR: Azure deployment requires ALLOW_AZURE_DEPLOY=true"
  echo "This will create billable Azure resources. Set this variable explicitly if you intend to deploy."
  exit 1
fi
```

## Infrastructure as Code Policy

- `infra/azure/` contains Bicep templates that document the Azure architecture.
- These templates are never applied automatically.
- CI does NOT run `az` or `terraform` commands.
- GitHub Actions workflows that could deploy to Azure are manually triggered only, require explicit secrets to be configured, and include prominent warnings about billing.

## Cost Documentation

- `scripts/azure/estimate-or-explain-cost.sh` explains which Azure services would incur charges and provides rough estimates.
- `scripts/azure/destroy.sh` provides rapid teardown of any Azure resources that were explicitly deployed.
- `docs/azure-deployment.md` includes a cost breakdown and teardown instructions.

## Local Emulator Mapping

| What the code uses                  | What runs locally                             | What it would be in Azure                     |
| ----------------------------------- | --------------------------------------------- | --------------------------------------------- |
| `MessageBus` (ServiceBus transport) | Azure Service Bus emulator in Docker          | Azure Service Bus (Standard/Premium tier)     |
| `ArtifactStore` (Azurite transport) | Azurite in Docker                             | Azure Blob Storage                            |
| Secrets / config                    | `.env` file                                   | Azure Key Vault                               |
| Metrics + traces                    | OTel Collector → Prometheus + Grafana + Tempo | Azure Monitor + Application Insights          |
| Relational DB                       | PostgreSQL in Docker                          | Azure Database for PostgreSQL Flexible Server |
| API + Worker                        | Local Node.js processes                       | Azure Container Apps                          |

## Verifying Zero Spend

If you have an Azure subscription and want to confirm nothing was provisioned:

```bash
az resource list --output table
```

Under normal development, this should return an empty table or only resources you created manually outside this project.

## Dependency on Paid External APIs

The project must run completely without:

- A Sapiom API key (`SAPIOM_API_KEY` absent → MockProvider is used automatically)
- Any LLM API key (OpenAI, Anthropic, etc.)
- Any paid search or data API

When `SAPIOM_API_KEY` is not set, the system logs a warning and routes all executions through `MockProvider`. The demo, tests, and dashboard all work in this mode.
