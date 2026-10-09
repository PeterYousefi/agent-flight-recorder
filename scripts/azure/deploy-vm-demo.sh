#!/usr/bin/env bash
set -euo pipefail
if [ "${ALLOW_AZURE_DEPLOY:-false}" != 'true' ]; then
  echo 'ERROR: Requires ALLOW_AZURE_DEPLOY=true. This creates billable Azure resources.'
  exit 1
fi
: "${AZURE_SUBSCRIPTION_ID:?Set the approved student subscription}"
: "${BUDGET_ALERT_EMAIL:?Set the private budget alert recipient}"
if [ "${FREE_ALLOWANCES_CONFIRMED:-false}" != 'true' ]; then
  echo 'ERROR: Verify remaining VM, PostgreSQL and P6 free allowances before deployment.'
  exit 1
fi
DEPLOY_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$DEPLOY_ROOT"
DEPLOY_GROUP='agent-recorder-demo-rg'
DEPLOY_LOCATION='canadacentral'
DEPLOY_LABEL='agent-recorder-demo'
export DEPLOY_GROUP
python3 scripts/azure/stop-stale-preflight.py
# Build and acceptance run on the Azure VM; Docker Desktop is never used.
node --check scripts/local/verify-demo.mjs
bash -n scripts/azure/build-vm-demo.sh
python3 scripts/azure/package-vm-source.py
if [ "$(az account show --query id -o tsv)" != "$AZURE_SUBSCRIPTION_ID" ]; then
  echo 'ERROR: Signed-in subscription differs from the approved subscription.'
  exit 1
fi
if [ "$(az rest --method get --url "https://management.azure.com/subscriptions/${AZURE_SUBSCRIPTION_ID}?api-version=2022-12-01" --query subscriptionPolicies.spendingLimit -o tsv)" != 'On' ]; then
  echo 'ERROR: Student spending limit must remain enabled.'
  exit 1
fi
if [ "$(az group exists --name "$DEPLOY_GROUP")" = 'true' ]; then
  echo 'ERROR: A group with this name already exists. Inspect it before reusing it.'
  exit 1
fi
for PROVIDER in Microsoft.Compute Microsoft.ManagedIdentity Microsoft.Network Microsoft.DBforPostgreSQL Microsoft.ServiceBus Microsoft.Storage; do
  if [ "$(az provider show --namespace "$PROVIDER" --query registrationState -o tsv)" != 'Registered' ]; then
    echo "Registering $PROVIDER..."
    az provider register --namespace "$PROVIDER" --wait --output none
  fi
done
python3 scripts/azure/check-vm-offer.py
umask 077
if [ ! -f .env.azure-ssh-key ]; then
  ssh-keygen -t ed25519 -N '' -f .env.azure-ssh-key -q
fi
python3 scripts/azure/prepare-vm-files.py parameters
# The private source archive excludes credentials and local dependency/build folders.
CREATED_GROUP=false
FINISHED=false
KEEP_FOR_REPAIR=false
cleanup_failed_deployment() {
  if [ "$CREATED_GROUP" = 'true' ] && [ "$FINISHED" != 'true' ]; then
    if [ "$KEEP_FOR_REPAIR" = 'true' ]; then
      echo 'Startup or verification failed. Keeping this project for diagnosis and repair; the budget alert remains active.'
      return
    fi
    echo 'Deployment failed. Removing only the newly created project resource group to stop ongoing charges.'
    if [ "$(az group exists --name "$DEPLOY_GROUP")" = 'true' ]; then
      az group delete --name "$DEPLOY_GROUP" --yes --output none || echo "ERROR: Cleanup failed; delete $DEPLOY_GROUP in Azure Portal."
    fi
  fi
}
trap cleanup_failed_deployment EXIT
trap 'echo "ERROR: Deployment command failed at line $LINENO (exit $?)."' ERR
az group create --name "$DEPLOY_GROUP" --location "$DEPLOY_LOCATION" --tags project=agent-flight-recorder purpose=public-mock-demo --output none
CREATED_GROUP=true
az deployment group validate --resource-group "$DEPLOY_GROUP" --template-file infra/azure/vm-demo.bicep --parameters @.env.azure-vm.parameters.json --output none
az deployment sub create --name afr-budget --location "$DEPLOY_LOCATION" --template-file infra/azure/budget.bicep --parameters @.env.azure-vm-budget.json --output none
az deployment group create --name afr-vm-demo --resource-group "$DEPLOY_GROUP" --template-file infra/azure/vm-demo.bicep --parameters @.env.azure-vm.parameters.json --output none
az deployment group show --name afr-vm-demo --resource-group "$DEPLOY_GROUP" --query properties.outputs -o json > .env.azure-vm.outputs.json
KEEP_FOR_REPAIR=true
python3 scripts/azure/prepare-vm-files.py runtime
DEPLOY_IP="$(python3 -c 'import json; print(json.load(open(".env.azure-vm.outputs.json"))["publicIp"]["value"])')"
DEPLOY_HOST="$(python3 -c 'import json; print(json.load(open(".env.azure-vm.outputs.json"))["publicHost"]["value"])')"
SSH_OPTIONS=(-i .env.azure-ssh-key -o UserKnownHostsFile=.env.azure-known-hosts -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5)
SSH_READY=false
for ATTEMPT in $(seq 1 90); do
  if ssh "${SSH_OPTIONS[@]}" "afradmin@$DEPLOY_IP" 'true' 2>/dev/null; then SSH_READY=true; break; fi
  sleep 5
done
if [ "$SSH_READY" != 'true' ]; then echo 'ERROR: VM SSH did not become available'; exit 1; fi
ssh "${SSH_OPTIONS[@]}" "afradmin@$DEPLOY_IP" 'set -eu; status=0; sudo cloud-init status --wait || status=$?; if [ "$status" -ne 0 ] && [ "$status" -ne 2 ]; then exit "$status"; fi; sudo docker version > /dev/null; sudo docker compose version; sudo mkdir -p /opt/afr; sudo chown afradmin:afradmin /opt/afr'
bash scripts/azure/build-with-temporary-size.sh
ssh "${SSH_OPTIONS[@]}" "afradmin@$DEPLOY_IP" 'sudo bash /opt/afr/infra/azure/vm/configure-memory.sh'
scp "${SSH_OPTIONS[@]}" .env.azure-vm-runtime "afradmin@$DEPLOY_IP:/opt/afr/infra/azure/vm/.env"
ssh "${SSH_OPTIONS[@]}" "afradmin@$DEPLOY_IP" 'set -eu; cd /opt/afr/infra/azure/vm; chmod 600 .env; sudo docker compose run --rm --no-deps app pnpm --filter @afr/persistence prisma:migrate:deploy; sudo docker compose up -d'
PUBLIC_READY=false
for ATTEMPT in $(seq 1 90); do
  if curl -fsS --max-time 10 "https://$DEPLOY_HOST/api/v1/settings" > /dev/null 2>&1; then PUBLIC_READY=true; break; fi
  sleep 5
done
if [ "$PUBLIC_READY" != 'true' ]; then echo 'ERROR: Public HTTPS demo did not become ready'; exit 1; fi
# Validate all scenarios with real Azure PostgreSQL/queue/blob and local trace/metrics backends.
ssh "${SSH_OPTIONS[@]}" "afradmin@$DEPLOY_IP" 'set -eu; cd /opt/afr/infra/azure/vm; sudo docker run --rm --network container:afr-public-demo-app-1 --memory=192m --memory-swap=384m -v /opt/afr/scripts/local/verify-demo.mjs:/tmp/verify-demo.mjs:ro -e NODE_OPTIONS=--max-old-space-size=96 -e AFR_VERIFY_API_BASE=http://localhost:3000/api/v1 -e AFR_VERIFY_TEMPO_BASE=http://tempo:3200 -e AFR_VERIFY_COLLECTOR_BASE=http://otel-collector:8889 afr:azure-vm-demo node /tmp/verify-demo.mjs'
ssh "${SSH_OPTIONS[@]}" "afradmin@$DEPLOY_IP" 'free -m; sudo docker stats --no-stream --format "{{.Name}} {{.MemUsage}}"'
curl -fsS --max-time 15 "https://$DEPLOY_HOST/grafana/api/health" > /dev/null
curl -fsS --max-time 15 "https://$DEPLOY_HOST/prometheus/-/ready" > /dev/null
curl -fsS --max-time 15 "https://$DEPLOY_HOST/" > /dev/null
FINISHED=true
echo "Public demo: https://$DEPLOY_HOST"
echo "Delete later: Azure Portal > Resource groups > $DEPLOY_GROUP > Delete resource group"
echo 'Expected low-traffic cost is under US$5/month while the verified free allowances apply. Alerts do not enforce a cap.'
