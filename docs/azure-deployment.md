# Azure architecture reference and cost guard

**Actual Azure resources deployed: none.**

**Azure cost for local development/demo: $0.**

The entire demonstrated system uses local PostgreSQL, Microsoft's Service Bus emulator, Azurite and open-source telemetry. No Azure account, subscription, credits or cloud credentials are required. Host compute, Docker Desktop and optional live Sapiom usage are separate from Azure charges.

`infra/azure/main.bicep` documents an optional mapping: API/worker to Container Apps, messaging to a Service Bus namespace/queue, artifacts to a private Blob container, and secrets to an RBAC Key Vault. Its resource conditions default to false. No cloud telemetry is provisioned: the local Collector/Prometheus/Tempo stack already works; Application Insights should be evaluated only for a future cloud deployment.

This is an architectural reference, locally compiled without applying it. The current application runtime deliberately rejects cloud endpoints and has no public authentication. Before deployment, add cloud transport/configuration, production image packaging, API ingress/authentication, scoped identity roles and Key Vault references, managed PostgreSQL networking, monitoring, retention, cost budgets and a reviewed deployment workflow. The reference creates none of those missing application capabilities. There is no deployment script or CI deployment action.

To validate syntax without provisioning:

```bash
az bicep build --file infra/azure/main.bicep --outfile /tmp/afr-reference.json
```

Every script under `scripts/azure/` requires `ALLOW_AZURE_DEPLOY=true`. The cost script is read-only and explains cost drivers rather than asserting an unverified monthly price. Review the [Azure pricing calculator](https://azure.microsoft.com/pricing/calculator/) for the selected region, SKUs, uptime, traffic, backups, retention and egress. Scale-to-zero compute does not make persistent cloud resources free.

If a separate future deployment was explicitly authorized, `scripts/azure/destroy.sh` requires an exact resource-group name and interactive matching confirmation, then requests asynchronous deletion. Verify completion separately; do not claim resources are removed when deletion has only started. Never run teardown against a shared or unrelated group. Billing and protected Key Vault retention may outlast deletion.
