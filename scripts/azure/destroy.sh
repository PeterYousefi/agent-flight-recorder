#!/usr/bin/env bash
# Agent Flight Recorder — Azure Resource Teardown
#
# This script PERMANENTLY DELETES all Azure resources for Agent Flight Recorder.
# It requires ALLOW_AZURE_DEPLOY=true to prevent accidental execution.
#
# Usage:
#   ALLOW_AZURE_DEPLOY=true AZURE_RESOURCE_GROUP=afr-rg ./scripts/azure/destroy.sh

set -euo pipefail

# ── Safety gate ──────────────────────────────────────────────────────────────
if [ "${ALLOW_AZURE_DEPLOY:-false}" != "true" ]; then
  echo ""
  echo "ERROR: Azure teardown requires ALLOW_AZURE_DEPLOY=true"
  echo ""
  echo "This script will PERMANENTLY DELETE Azure resources and incur"
  echo "final charges for any resources that were provisioned."
  echo ""
  echo "To proceed:"
  echo "  ALLOW_AZURE_DEPLOY=true AZURE_RESOURCE_GROUP=<rg-name> $0"
  echo ""
  exit 1
fi

RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-}"

if [ -z "${RESOURCE_GROUP}" ]; then
  echo "ERROR: AZURE_RESOURCE_GROUP environment variable is required."
  echo "Example: ALLOW_AZURE_DEPLOY=true AZURE_RESOURCE_GROUP=afr-rg $0"
  exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Agent Flight Recorder — Azure Teardown"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Resource group: ${RESOURCE_GROUP}"
echo ""
echo "  WARNING: This will permanently delete all resources in"
echo "  resource group '${RESOURCE_GROUP}'."
echo ""
read -r -p "  Type the resource group name to confirm: " CONFIRM

if [ "${CONFIRM}" != "${RESOURCE_GROUP}" ]; then
  echo "  Confirmation did not match. Aborting."
  exit 1
fi

echo ""
echo "→ Verifying Azure CLI is logged in..."
az account show --output none

echo "→ Deleting resource group '${RESOURCE_GROUP}'..."
az group delete \
  --name "${RESOURCE_GROUP}" \
  --yes \
  --no-wait

echo ""
echo "✓ Deletion initiated. Resource group '${RESOURCE_GROUP}' is being deleted."
echo "  This may take several minutes. Check Azure Portal for status."
echo ""
echo "  To verify deletion is complete:"
echo "  az group show --name ${RESOURCE_GROUP}"
echo ""
echo "  After deletion, run 'az resource list --output table' to confirm"
echo "  no resources remain."
echo ""
