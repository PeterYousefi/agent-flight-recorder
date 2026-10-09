# Public Azure VM demo

The selected deployment hosts the API, static console, embedded logical worker, Grafana, Tempo, Prometheus and OpenTelemetry Collector together on a Canada Central `Standard_B2pts_v2` ARM VM. PostgreSQL uses a B1ms Flexible Server with 32 GB storage and local backups. Azure Service Bus Basic replaces the large local queue emulator and its SQL Server dependency; private Azure Blob Storage replaces Azurite. Paid providers remain disabled. Local development continues to use the existing emulators and separate processes.

The public demo is deployed and verified at [https://agent-recorder-demo.canadacentral.cloudapp.azure.com](https://agent-recorder-demo.canadacentral.cloudapp.azure.com). The hostname is `agent-recorder-demo.canadacentral.cloudapp.azure.com`. The Azure DNS label adds no separately purchased domain or DNS zone. HTTPS uses Caddy certificate automation.

## Expected cost and limits

Account screenshots supplied on October 8, 2026 show unused free allowances for 750 VM hours, 750 PostgreSQL hours, 32 GB PostgreSQL storage and backup, and P6 disk storage. The selected OS disk is a 64 GiB P6 Premium LRS disk. Allowances are shared across the subscription; deletion does not reset usage or extend the promotional period.

| Resource                                                         | Expected monthly cost under verified allowances |
| ---------------------------------------------------------------- | ----------------------------------------------- |
| B2pts v2 VM, one P6 disk                                         | Free within remaining allowances                |
| PostgreSQL B1ms, 32 GB storage and included backups              | Free within remaining allowances                |
| One Standard static IPv4                                         | US$3.60 per 720 hours; US$3.72 per 744 hours    |
| Service Bus Basic                                                | US$0.05 per million operations                  |
| Private Blob artifacts                                           | Small storage and operation charges             |
| Grafana, Tempo, Prometheus, collector, HTTPS proxy               | Included on the same VM                         |
| Registry, load balancer, paid telemetry ingestion, custom domain | None provisioned                                |

The low-traffic estimate is under US$5 per month while the matching free allowances remain active. This is not a guaranteed cap. Rates, free-offer eligibility, usage and expiration must be checked in Azure Cost Management. The five-unit monthly project budget sends alerts to the privately supplied recipient at 80% and 100%; Azure budgets use the subscription's billing currency and do not stop resources. The subscription credit spending limit stays enabled; deployment does not upgrade billing. Traffic beyond free bandwidth and usage allowances can add charges. Disable or delete the demo before promotional allowances expire if the paid retail cost is unacceptable.

Sources: [student offer](https://azure.microsoft.com/en-us/free/students/), [free usage tracking](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/check-free-service-usage), [retail price API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices), [budgets](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets).

## Deployment

`scripts/azure/deploy-vm-demo.sh` requires explicit `ALLOW_AZURE_DEPLOY=true`, an approved subscription ID, `FREE_ALLOWANCES_CONFIRMED=true`, a private budget recipient, and confirmation of the remaining free allowances. It refuses to reuse an existing resource group. It creates the alert before paid infrastructure. Credentials, SSH keys and generated parameters stay in ignored mode-0600 `.env.*` files. A small archive of source files is uploaded over SSH and built natively on the ARM VM, avoiding a paid registry, an extra build machine, and Docker Desktop load. For compilation only, the VM is temporarily resized to the same ARM family with 8 GiB RAM (`Standard_B2ps_v2`). The helper verifies its live Linux retail price is at most US$0.10/hour, bounds the remote build to 30 minutes, and restores `Standard_B2pts_v2` before starting the application. The helper records the current verified rate privately. At the required maximum of US$0.10/hour, a 15-minute build adds at most US$0.025 of temporary compute, plus resize/start time. No paid registry or extra disk is created. Sequential builds use a 4 GiB temporary Node heap; the running application retains its 96 MiB heap. A failed restoration triggers project cleanup. The built runtime is type-checked and its runtime, adapter and telemetry unit tests run before startup. Provisioning failures remove only the dedicated resource group created by the script. After provisioning succeeds, startup or verification failures preserve the project for diagnosis and repair; the build helper still restores the small VM on exit or deletes the group if restoration fails. Delete the group to stop its ongoing charges. Cleanup failures are reported.

PostgreSQL permits connections only from the VM's static public address and requires verified TLS. The app's user-assigned identity has queue sender/receiver and private artifact-container permissions. Password SSH is disabled and inbound SSH is limited to the deploying user's address. Only HTTP certificate validation and HTTPS are open publicly; database, collector, Tempo and application ports are not published. Grafana anonymous users have Viewer access. All public controls operate on shared synthetic executions, so visitors can see and control one another's demo work. Arbitrary execution creation and paid providers are disabled; request rates and total execution creation are bounded.

Containers have explicit memory limits, bounded logs, a 128 MB / six-hour metrics store and one-hour trace retention. The VM uses 4 GiB of swap on the existing disk for build and startup peaks, with a persistent compressed zswap cache capped at 25% of RAM to reduce swap I/O. Grafana uses SQLite WAL mode with high availability, alerting and automatic plugin preinstallation disabled for this single-instance dashboard demo. New provider startup can temporarily show unavailable while Azure identity permissions propagate. The deployment verifies all curated scenarios, immutable replay/requeue, cancellation, private artifacts, trace propagation and metrics against the actual Azure services before reporting success.

## Delete and recreate

In Azure Portal choose **Resource groups → agent-recorder-demo-rg → Delete resource group**, type the group name and confirm. Wait for deletion to complete. This removes the VM, disk, IPv4 address, database, queue, storage and identity together. The separate subscription budget can also be removed from Cost Management; it has no resource hosting charge. Deletion permanently removes the demo data, but leaves GitHub and the local checkout intact. Previously incurred charges may appear after deletion. Recreating the project uses remaining free allowances, and DNS-label availability must be checked again.

[Azure deletion instructions](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/delete-resource-group).
