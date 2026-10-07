# Artifacts

The Blob SDK is pinned to 12.27.0 (Storage API 2025-01-05), compatible with the checked-in Azurite image. Newer SDK defaults exceeded the emulator API version during verification; no API-version checks were bypassed.

`AzuriteArtifactStore` implements `ArtifactStore` with the Azure Blob SDK against local Azurite only. It rejects nonlocal endpoints. `initialize()` creates a private container if absent and rejects an existing public container. Application storage connections and opaque storage keys are never exposed by the API.

Artifacts contain UTF-8 JSON, with a default 1 MiB limit and application/json content type. Opaque random UUID blob names do not include user input or execution names. Blob metadata stores execution ownership, artifact kind, creation timestamp and SHA-256 checksum. Upload uses a create-only condition. Reads verify ownership and declared size before downloading, then recompute the checksum before parsing JSON. Metadata lookup and deletion enforce the same ownership checks. API reads first check the artifact belongs to the requested execution in PostgreSQL.

Normal operations require no Azure account. `UseDevelopmentStorage=true` selects the SDK's public local emulator credentials. Actual production Blob Storage would need a separate deployment-enabled runtime and authenticated API; this v1 implementation does not silently connect to cloud storage.

Run local integration checks with `RUN_LOCAL_AZURE_TESTS=true pnpm --filter @afr/adapters test:integration`. The tests create and delete a uniquely named test container, check anonymous download is denied, and verify size/checksum/ownership enforcement.

A provider output is written to private blob storage before its metadata and event are committed to PostgreSQL. Failure or cancellation between these steps can leave an orphan blob. Cross-store atomicity is not claimed; periodic orphan cleanup is a future improvement. Persisted execution history remains transactional.
