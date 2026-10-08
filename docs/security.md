# Security posture

This release is a local development control plane, bound to loopback. It has no user authentication or tenant isolation and must not be exposed to a public network. Docker host ports also bind to loopback. Cloud execution is not supported by the local runtime guards.

## Implemented controls

- Fastify validates hosts and browser origins before mutation handlers, including empty POST requests. A CORS response header alone would not stop cross-origin form actions. Local Swagger requests and credential-free CLI calls remain usable.
- Zod and JSON Schema validate UUIDs, bounded pagination, provider names, budget ranges and strict request shapes. API bodies are capped at 1 MiB. Artifact JSON is capped at 1 MiB, stored privately, checked for ownership and SHA-256 integrity, and served through the API without public blob URLs.
- Response headers disable sniffing/caching, limit referrers and sensitive browser permissions, apply same-site resource policy, deny framing and restrict CSP frame ancestors/base URI/object sources. The React UI renders artifact values as escaped text. Development Vite/Swagger require their normal script/style behavior; this is not a production CSP or TLS deployment.
- Structured logs allowlist fact identifiers, status, sequence and correlation. Inputs, credential headers, database URLs and provider error bodies are not logged. Public errors are normalized. The Logs tab reconstructs safe facts; no process-log backend is asserted.
- Runtime configuration rejects non-local database/broker/storage/OTLP endpoints, malformed limits and enabled Sapiom without credentials. Sapiom sends application credentials only to its fixed HTTPS Router endpoint, rejects redirects, and bounds token limits and deadlines.
- Real `.env`, keys and credential files are ignored. `.env.example` contains placeholders. `pnpm demo` explicitly disables Sapiom and removes its key from child environments. Normal tests exclude live integration tests even if flags are set.
- Gitleaks 8.30.1 scans all Git history and non-ignored working source with redacted output. Only two exact historical fingerprints are allowlisted: a Lovable fixture idempotency identifier and Microsoft's public Azurite development key. No whole file or credential pattern is exempted. Install the official checksum-verified binary, or set `GITLEAKS_BIN`.
- `pnpm security:audit` checks production and development dependencies. Dependabot groups coupled OpenTelemetry and Prisma changes. Security CI runs both checks with read-only repository permissions.
- Optional Azure scripts require `ALLOW_AZURE_DEPLOY=true`. No cloud deployment workflow exists. Bicep is disabled by default and is a reference, not a deployable application release.

## Dependency remediation

The October 7, 2026 audit initially reported eight advisories. OpenTelemetry experimental packages were aligned to 0.223.0 with stable SDKs 2.12.0, Prisma/client to the compatible 6.19.3 line, and Swagger UI to 6.1.1. A scoped `@prisma/config>deepmerge-ts` override uses patched 8.0.2; generation, migrations and PostgreSQL tests verify compatibility. The resulting full audit reports zero vulnerabilities. An audit is a point-in-time database check, not proof that software has no defects.

## Reproduce

```bash
GITLEAKS_BIN=/path/to/gitleaks pnpm security:secrets
pnpm security:audit
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

Future public deployment needs authentication/authorization, tenant ownership, TLS/reverse proxy policy, rate limits, network isolation, retention and incident procedures. Keep Sapiom credentials local and rotate any genuine exposed credential before changing repository history; never suppress a real finding.
