#!/usr/bin/env bash
# Runs on the native ARM demo VM, with no registry or additional build service.
set -euo pipefail
cd /opt/afr
if [ "$(uname -m)" != 'aarch64' ]; then
  echo 'ERROR: This low-cost build requires the selected ARM VM.'
  exit 1
fi
echo 'Building the public demo on Azure (Docker Desktop is not involved)...'
sudo docker build \
  --build-arg VITE_PUBLIC_DEMO=true \
  --build-arg VITE_GRAFANA_URL=/grafana \
  --build-arg VITE_PROMETHEUS_URL=/prometheus \
  --build-arg BUILD_NODE_OPTIONS=--max-old-space-size=4096 \
  -t afr:azure-vm-demo .
echo 'Checking the built runtime and cloud configuration...'
sudo docker run --rm --memory=768m --memory-swap=3g \
  -e NODE_OPTIONS=--max-old-space-size=1024 \
  afr:azure-vm-demo pnpm --workspace-concurrency=1 --recursive run typecheck
sudo docker run --rm --memory=640m --memory-swap=3g \
  -e NODE_OPTIONS=--max-old-space-size=256 \
  afr:azure-vm-demo pnpm --filter @afr/runtime --filter @afr/adapters \
  --filter @afr/observability --workspace-concurrency=1 test
