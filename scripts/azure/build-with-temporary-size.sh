#!/usr/bin/env bash
set -euo pipefail
if [ "${ALLOW_AZURE_DEPLOY:-false}" != 'true' ]; then
  echo 'ERROR: Temporary Azure build requires ALLOW_AZURE_DEPLOY=true.'
  exit 1
fi
cd "$(dirname "$0")/../.."
GROUP='agent-recorder-demo-rg'
VM='agent-recorder-demo'
if [ "$(az vm show -g "$GROUP" -n "$VM" --query tags.project -o tsv)" != 'agent-flight-recorder' ]; then
  echo 'ERROR: Refusing to resize a VM outside this project.'
  exit 1
fi
if [ "$(az vm show -g "$GROUP" -n "$VM" --query hardwareProfile.vmSize -o tsv)" != 'Standard_B2pts_v2' ]; then
  echo 'ERROR: Expected the original student free-tier size.'
  exit 1
fi
python3 scripts/azure/check-build-price.py
ADDRESS="$(python3 -c 'import json; print(json.load(open(".env.azure-vm.outputs.json"))["publicIp"]["value"])')"
SSH_OPTIONS=(-i .env.azure-ssh-key -o UserKnownHostsFile=.env.azure-known-hosts -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
RESIZED=false
restore_free_size() {
  if [ "$RESIZED" = 'true' ]; then
    echo 'Restoring the original student free-tier VM size...'
    az vm deallocate -g "$GROUP" -n "$VM" --output none || return 1
    az vm resize -g "$GROUP" -n "$VM" --size Standard_B2pts_v2 --output none || return 1
    az vm start -g "$GROUP" -n "$VM" --output none || return 1
    RESIZED=false
  fi
}
cleanup() {
  if ! restore_free_size; then
    echo 'ERROR: Could not restore the free size. Deleting this project group to stop charges.'
    az group delete --name "$GROUP" --yes --output none
  fi
}
trap cleanup EXIT
wait_ssh() {
  for ATTEMPT in $(seq 1 60); do
    if ssh "${SSH_OPTIONS[@]}" "afradmin@$ADDRESS" 'true' 2>/dev/null; then return 0; fi
    sleep 5
  done
  return 1
}
echo 'Temporarily resizing only the existing VM for the build...'
az vm deallocate -g "$GROUP" -n "$VM" --output none
RESIZED=true
az vm resize -g "$GROUP" -n "$VM" --size Standard_B2ps_v2 --output none
az vm start -g "$GROUP" -n "$VM" --output none
wait_ssh
scp "${SSH_OPTIONS[@]}" .env.azure-vm-source.tar.gz "afradmin@$ADDRESS:/opt/afr/"
# Existing disk, database, identity and public IP remain unchanged. No registry.
ssh "${SSH_OPTIONS[@]}" "afradmin@$ADDRESS" 'set -eu; cd /opt/afr; tar -xzf .env.azure-vm-source.tar.gz; timeout 1800 bash scripts/azure/build-vm-demo.sh'
restore_free_size
wait_ssh
echo 'Native image verified and VM restored to Standard_B2pts_v2.'
