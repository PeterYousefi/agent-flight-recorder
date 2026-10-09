# Security posture

The default local control plane and emulator ports bind to loopback and must remain local. A separate opt-in Azure mode exposes a shared synthetic demo over HTTPS. Neither mode has user authentication or tenant isolation; the public demo contains only mock-provider work and is unsuitable for private or production workloads. Cloud endpoints are accepted only by the explicit Azure runtime guards.

## Implemented controls

- Fastify validates hosts and browser origins before mutation handlers, including empty POST requests. A CORS response header alone would not stop cross-origin form actions. Local Swagger requests and credential-free CLI calls remain usable.
- Zod and JSON Schema validate UUIDs, bounded pagination, provider names, budget ranges and strict request shapes. API bodies are capped at 1 MiB. Artifact JSON is capped at 1 MiB, stored privately, checked for ownership and SHA-256 integrity, and served through the API without public blob URLs.
- Response headers disable sniffing/caching, limit referrers and sensitive browser permissions, apply same-site resource policy, deny framing and restrict CSP frame ancestors/base URI/object sources. The React UI renders artifact values as escaped text. Development Vite/Swagger require their normal script/style behavior; this is not a production CSP or TLS deployment.
- Structured logs allowlist fact identifiers, status, sequence and correlation. Inputs, credential headers, database URLs and provider error bodies are not logged. Public errors are normalized. The Logs tab reconstructs safe facts; no process-log backend is asserted.
- Local runtime configuration rejects non-local database/broker/storage/OTLP endpoints, malformed limits and enabled Sapiom without credentials. Azure mode requires verified TLS to Azure PostgreSQL, Azure Service Bus/Blob endpoints, a managed identity and disabled paid providers. Sapiom sends application credentials only to its fixed HTTPS Router endpoint, rejects redirects, and bounds token limits and deadlines.
- Real `.env`, keys and credential files are ignored. `.env.example` contains placeholders. `pnpm demo` explicitly disables Sapiom and removes its key from child environments. Normal tests exclude live integration tests even if flags are set.
- Gitleaks 8.30.1 scans all Git history and non-ignored working source with redacted output. Only two exact historical fingerprints are allowlisted: a Lovable fixture idempotency identifier and Microsoft's public Azurite development key. No whole file or credential pattern is exempted. Install the official checksum-verified binary, or set `GITLEAKS_BIN`.
- `pnpm security:audit` checks production and development dependencies. Dependabot groups coupled OpenTelemetry and Prisma changes. Security CI runs both checks with read-only repository permissions.
- Optional Azure scripts require `ALLOW_AZURE_DEPLOY=true`. No cloud deployment workflow exists. The VM template is disabled by default. Its deployment script checks the subscription spending limit, permission roles and IPv4 pricing, creates a project budget alert before hosting resources, and removes its newly created resource group on failure. Alerts do not enforce a spending cap.

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

The public mock demo has exact Host/Origin checks, bounded creation and request rates, a restricted set of mutation routes, HTTPS through Caddy, private Azure artifacts, queue/container-scoped managed identity permissions, an IP-restricted PostgreSQL firewall and SSH restricted to the deploying address. All visitors can inspect and control the shared synthetic executions; artifact ownership checks associate data with an execution, not an authenticated user. Grafana anonymous access is Viewer-only. Container memory, logs, metrics and trace retention are bounded. Production use still needs authentication/authorization, tenant ownership, stronger traffic controls, retention policy and incident procedures. Keep Sapiom credentials local and rotate any genuine exposed credential before changing repository history; never suppress a real finding.
