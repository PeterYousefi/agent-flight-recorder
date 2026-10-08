#!/usr/bin/env bash
set -euo pipefail
if [ "${ALLOW_AZURE_DEPLOY:-false}" != "true" ]; then
  echo 'Actual Azure resources deployed by this project: none.'
  echo 'Azure cost for local development/demo: $0.'
  echo 'Optional cloud cost review requires ALLOW_AZURE_DEPLOY=true; this read-only script never provisions resources.'
  exit 1
fi
cat <<'TEXT'
Local development/demo uses Docker emulators and open-source telemetry: Azure cost $0.
No Azure resources have been provisioned by this project.

Cloud architecture would incur charges for:
- Container Apps CPU/memory, requests and minimum replicas.
- Service Bus namespace tier and messaging operations.
- Blob capacity, operations and egress.
- Managed PostgreSQL compute, storage, backup and availability.
- Key Vault operations and telemetry ingestion/retention.
- Optional image registry, private endpoints and networking.

No monthly estimate is asserted: region, traffic, uptime, SKU and retention must be chosen first.
Review current prices using https://azure.microsoft.com/pricing/calculator/.
Create a separate budget and alerts before any explicitly authorized deployment.
Teardown is scripts/azure/destroy.sh; deletion must be verified and billing can lag.
The included Bicep is an architectural reference; the current runtime is local-only.
TEXT
