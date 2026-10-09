#!/usr/bin/env bash
# Take over this chat's interrupted build without recreating healthy Azure services.
set -euo pipefail
if [ "${ALLOW_AZURE_DEPLOY:-false}" != 'true' ]; then exit 1; fi
cd "$(dirname "$0")/../.."
: "${AZURE_SUBSCRIPTION_ID:?Required}"
if [ "$(az account show --query id -o tsv)" != "$AZURE_SUBSCRIPTION_ID" ]; then exit 1; fi
if [ "$(az vm show -g agent-recorder-demo-rg -n agent-recorder-demo --query tags.project -o tsv)" != 'agent-flight-recorder' ]; then exit 1; fi
if [ "$(az rest --method get --url "https://management.azure.com/subscriptions/${AZURE_SUBSCRIPTION_ID}?api-version=2022-12-01" --query subscriptionPolicies.spendingLimit -o tsv)" != 'On' ]; then exit 1; fi
python3 scripts/azure/check-build-price.py
python3 scripts/azure/package-vm-source.py
TAKEN_OVER=false
FINISHED=false
cleanup() {
  if [ "$TAKEN_OVER" = 'true' ] && [ "$FINISHED" != 'true' ]; then
    echo 'Resume failed. Removing only this project group to stop ongoing charges.'
    if [ "$(az group exists --name agent-recorder-demo-rg)" = 'true' ]; then
      az group delete --name agent-recorder-demo-rg --yes --output none
    fi
  fi
}
trap cleanup EXIT
# Terminate only the old deployment controller. SIGKILL prevents its failure trap
# from deleting the VM during this deliberate, supervised resize/restart.
python3 - <<'PY'
import os, signal, subprocess
processes = subprocess.check_output(['ps', '-axo', 'pid=,command='], text=True)
matches = []
for line in processes.splitlines():
    parts = line.strip().split(None, 1)
    if len(parts) == 2 and parts[1] == 'bash scripts/azure/deploy-vm-demo.sh':
        matches.append(int(parts[0]))
if len(matches) != 1:
    raise SystemExit('Expected exactly this project deployment controller; refusing takeover')
os.kill(matches[0], signal.SIGKILL)
print('Previous build controller stopped for supervised VM resize.')
PY
TAKEN_OVER=true
bash scripts/azure/build-with-temporary-size.sh
ADDRESS="$(python3 -c 'import json; print(json.load(open(".env.azure-vm.outputs.json"))["publicIp"]["value"])')"
HOST="$(python3 -c 'import json; print(json.load(open(".env.azure-vm.outputs.json"))["publicHost"]["value"])')"
SSH_OPTIONS=(-i .env.azure-ssh-key -o UserKnownHostsFile=.env.azure-known-hosts -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
scp "${SSH_OPTIONS[@]}" .env.azure-vm-runtime "afradmin@$ADDRESS:/opt/afr/infra/azure/vm/.env"
ssh "${SSH_OPTIONS[@]}" "afradmin@$ADDRESS" 'set -eu; cd /opt/afr/infra/azure/vm; chmod 600 .env; sudo docker compose run --rm --no-deps app pnpm --filter @afr/persistence prisma:migrate:deploy; sudo docker compose up -d'
READY=false
for ATTEMPT in $(seq 1 90); do
  if curl -fsS --max-time 10 "https://$HOST/api/v1/settings" > /dev/null 2>&1; then READY=true; break; fi
  sleep 5
done
if [ "$READY" != 'true' ]; then exit 1; fi
ssh "${SSH_OPTIONS[@]}" "afradmin@$ADDRESS" 'set -eu; cd /opt/afr/infra/azure/vm; sudo docker compose exec -T -e AFR_VERIFY_API_BASE=http://localhost:3000/api/v1 -e AFR_VERIFY_TEMPO_BASE=http://tempo:3200 -e AFR_VERIFY_COLLECTOR_BASE=http://otel-collector:8889 app node /app/scripts/local/verify-demo.mjs'
for PATHNAME in '/' '/grafana/api/health' '/prometheus/-/ready'; do
  HEALTHY=false
  for ATTEMPT in $(seq 1 30); do
    if curl -fsS --max-time 10 "https://$HOST$PATHNAME" > /dev/null 2>&1; then HEALTHY=true; break; fi
    sleep 3
  done
  if [ "$HEALTHY" != 'true' ]; then exit 1; fi
done
if [ "$(az vm show -g agent-recorder-demo-rg -n agent-recorder-demo --query hardwareProfile.vmSize -o tsv)" != 'Standard_B2pts_v2' ]; then exit 1; fi
ssh "${SSH_OPTIONS[@]}" "afradmin@$ADDRESS" 'free -m; sudo docker stats --no-stream --format "{{.Name}} {{.MemUsage}}"'
FINISHED=true
echo "Public demo: https://$HOST"
