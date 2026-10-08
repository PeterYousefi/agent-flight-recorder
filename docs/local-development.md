# Local development

Prerequisites: Node.js 22+, pnpm 9.15.9, running Docker Desktop (Linux containers) and available loopback ports. SQL Edge/Service Bus emulator use Microsoft's supported x64 container stack; on Apple Silicon Docker runs those images with emulation. No Azure account or external API key is needed.

```bash
pnpm install --frozen-lockfile
pnpm demo
```

The launcher starts the observability Docker profile, builds packages, applies existing migrations, starts API/worker and serves the React console. It sets known local emulator configuration and forces Sapiom disabled independently of `.env`. Database/artifact/telemetry named volumes persist across ordinary shutdown. Ctrl+C terminates the launcher's own child process groups; it leaves Docker containers and data available. `make demo` delegates to the same launcher.

| Surface            | Local URL                                                            |
| ------------------ | -------------------------------------------------------------------- |
| Console / Demo Lab | http://localhost:5173 / http://localhost:5173/demo-lab               |
| API / Swagger      | http://localhost:3000/api/v1/health / http://localhost:3000/api/docs |
| Grafana            | http://localhost:3001/d/afr-operations                               |
| Prometheus         | http://localhost:9090                                                |
| Tempo API          | http://localhost:3200                                                |

Grafana's development-only login is `admin` / `admin`. All host ports bind to loopback. Local defaults are public emulator settings, not production credentials.

Run `node scripts/local/verify-demo.mjs` for real backend acceptance and `pnpm --filter @afr/web exec playwright test` for console acceptance. Install the official test browser once with `pnpm --filter @afr/web exec playwright install chromium`. The tests create inspectable mock executions. Sapiom live tests are separate and are never required for normal validation.

For database tests, create a separate local `afr_integration_test` database, apply the same migrations using its `DATABASE_URL`, and export `AFR_TEST_DATABASE_URL` to that database. Do not point integration cleanup at a production database. Tests isolate data by generated agent IDs. See [persistence](persistence.md) for migration/transaction details.

Troubleshooting: start Docker before the launcher; free ports 3000/5173 by stopping their owning applications; use Settings to see dependency readiness. If Docker's VM reports an invalid directory sharing configuration, repair its shared-folder settings rather than resetting named volumes. The Compose config is embedded so macOS Desktop bind-mount permissions are not required. Run `python3 scripts/local/sync-compose-config.py --check` after editing canonical configuration.

To stop containers without removing persisted data:

```bash
docker compose --profile observability down
```

Deleting volumes is destructive and is not part of normal startup or verification.
