# Local release acceptance evidence

Verified October 7, 2026 using the complete `pnpm demo` launcher on Apple M2/macOS arm64 with Docker Desktop. The launcher completed the workspace production build and applied all six PostgreSQL migrations before starting API, worker and console. MockProvider was selected, Sapiom disabled and its key removed from the launcher child environment. No Azure account or provisioning command was used.

## Executed checks

| Check                            | Result                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Unit suites                      | 127 passed: domain 94, application 4, providers 16, observability 1, in-memory adapters 8, runtime 4                               |
| PostgreSQL integration           | 49 passed, isolated `afr_integration_test` database                                                                                |
| API integration                  | 7 passed, including validation/body limits, idempotency/control flows and Host/Origin/security headers                             |
| Official emulator integration    | 7 passed: Service Bus 3, private Azurite 4                                                                                         |
| Actual browser acceptance        | 5 passed; real API, worker, database and artifacts                                                                                 |
| Format / lint / strict typecheck | Passed                                                                                                                             |
| Full workspace production build  | Passed; frontend built in 4m 13s on this machine, all backend packages compiled                                                    |
| Backend demo verifier            | Passed; all scenarios, immutable source history, private artifacts, six required trace spans and exported metrics                  |
| Dependency audit                 | Zero vulnerabilities across production and development dependencies                                                                |
| Gitleaks                         | Full Git history and non-ignored working source passed; exact historical false-positive fingerprints documented in security policy |
| Local Compose config consistency | Checked by `scripts/local/sync-compose-config.py --check`                                                                          |
| Optional Bicep                   | Locally compiled without warnings; never deployed                                                                                  |
| Azure script gates               | Both scripts rejected execution without explicit opt-in; no teardown/provisioning performed                                        |

Normal unit runs skip the separately gated database, emulator and API suites; those suites were then executed explicitly. Live Sapiom integration was deliberately not run. The total above is **195 executed tests**, plus the executable backend acceptance verifier and benchmark.

## The 25 requested acceptance points

|   # | Requested behavior    | Actual evidence                                                                                               |
| --: | --------------------- | ------------------------------------------------------------------------------------------------------------- |
|   1 | Create execution      | Real scenario POSTs and 30 benchmark creation requests                                                        |
|   2 | Queued                | Persisted `execution.queued` facts measured in every benchmark execution                                      |
|   3 | Worker processing     | Service Bus delivery, `execution.started`, successful terminal state and worker trace span                    |
|   4 | Events persist        | Ordered PostgreSQL facts returned by API, repositories and browser timeline                                   |
|   5 | Success               | Verifier success scenario ends SUCCEEDED                                                                      |
|   6 | Transient retries     | Verifier and browser observe retry fact and two attempts                                                      |
|   7 | Retry success         | Second attempt ends SUCCEEDED                                                                                 |
|   8 | Budget warning        | Verifier asserts `budget.warning` on successful warning scenario                                              |
|   9 | Budget exceeded       | Overrun scenario ends BUDGET_EXCEEDED                                                                         |
|  10 | Permanent failure     | Permanent provider failure ends DEAD_LETTERED with failure facts                                              |
|  11 | Dead letter           | Exhausted scenario persists historical dead-letter record                                                     |
|  12 | New requeue           | Verifier/browser compare IDs, linkage and unchanged original events/snapshot                                  |
|  13 | New replay            | Simulation replay has a new ID and succeeds through normal queue/worker flow                                  |
|  14 | Immutable original    | Full source event response unchanged after replay/requeue                                                     |
|  15 | Artifacts             | Actual private Azurite write/read plus owner/checksum/private-access integration checks                       |
|  16 | Traces                | Tempo returns HTTP, publish, consume, worker, provider and artifact spans for the persisted trace ID          |
|  17 | Metrics               | Collector exports required creation/success/retry/dead-letter/budget/cost series                              |
|  18 | API                   | Live readiness/control/read endpoints and seven integration tests                                             |
|  19 | Real frontend data    | Browser compares overview with live API and inspects persisted detail                                         |
|  20 | Demo Lab              | Browser launches transient/cancel/replay scenarios and navigates to actual new executions                     |
|  21 | Timeline              | Two attempt groups and retry metadata inspected by browser                                                    |
|  22 | Graph                 | Browser selects actual fact node and checks retry flow/details                                                |
|  23 | Zero Azure credits    | Only local Docker services; no cloud resources provisioned                                                    |
|  24 | No Sapiom key         | Launcher explicitly disables Sapiom; safe Settings reports unconfigured                                       |
|  25 | Sapiom code available | Verified Router adapter with configured-provider dispatch, mocked HTTP tests and a separately gated live test |

One backend verifier run's transient execution was `77df7503-063b-4b1b-9211-925d5a3db751`, trace `3ddbd1ad7e21bfc605bb2d7f2bb86d0e`. These are local demonstration identifiers, not retained production data. Later browser runs regenerate the committed screenshots with fresh real executions.

## Reproduce

Follow [local development](local-development.md). With `pnpm demo` running:

```sh
node scripts/local/verify-demo.mjs
pnpm --filter @afr/web exec playwright test
pnpm benchmark
```

The verifier waits for asynchronous terminal facts, Tempo ingestion and independent five-second metric export. It fails on missing results; it does not replace infrastructure with mocks. [Benchmark results](benchmarks.md) disclose sample size and methodology. GitHub's CI, Security and Local acceptance workflows provide independent verification of the final pushed commit. Their live status is linked in the README.

**Actual Azure resources deployed: none.**

**Azure cost for local development/demo: $0.**
