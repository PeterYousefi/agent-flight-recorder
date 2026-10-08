# Local benchmark results

Captured October 7, 2026 at 20:14 Toronto time (October 8 00:14 UTC). Apple M2, eight logical CPUs, 16 GiB RAM, macOS arm64, Node 24.18.0, pnpm 9.15.9. API and worker are local Node processes; PostgreSQL 16, official Service Bus emulator and private Azurite run in Docker. The emulator SQL sidecar uses amd64 emulation. Worker concurrency is five.

Run `pnpm demo`, wait for readiness, then `pnpm benchmark`. Optional `AFR_BENCHMARK_SAMPLES` accepts 10–100 samples (default 30). The ignored `benchmark-results/latest.json` contains timestamps, machine metadata and measurements. Benchmark executions and private artifacts remain available for inspection. No paid provider or Azure resource is used.

The recorded run was performed after the build finished, with no simultaneous browser tests or load generators. There are five list/history warm-up reads; creation requests run sequentially without a separate creation warm-up. Each request includes full response-body decoding. The provider is deterministic mock success; this measures infrastructure rather than model inference.

| Measurement                               | Samples | Mean (ms) | P50 (ms) | P95 (ms) | Max (ms) |
| ----------------------------------------- | ------: | --------: | -------: | -------: | -------: |
| GET executions, page of 25                |      30 |      4.24 |     4.19 |     4.94 |     6.14 |
| POST execution, atomic state/facts/outbox |      30 |     16.26 |    16.78 |    23.06 |    23.31 |
| GET ordered event history                 |      30 |      3.29 |     3.09 |     5.45 |     6.27 |
| Created → queued persisted facts          |      30 |       8.2 |        9 |       12 |       12 |
| Queued → worker started persisted facts   |      30 |     306.4 |      245 |      516 |      516 |
| Created → succeeded persisted facts       |      30 |     369.3 |      342 |      572 |      575 |

The 30-execution batch completed in **1.071 seconds**, observed throughput **28.01 executions/second**. Batch timing includes sequential creation, terminal polling every 50 ms and event-history reads. It is not sustained maximum throughput.

HTTP latency uses Node's monotonic performance clock. Scheduling, queue-to-worker and execution wall time use actual persisted event timestamps on this single host, with millisecond granularity. P95 uses the nearest-rank sample. Queue delay includes the outbox polling cadence, transport delivery and worker claim; it is not an isolated broker latency measurement. POST creation includes transactional event persistence, but no isolated event-write overhead is asserted.

Limits: one development machine, 30 small synthetic executions, warm database/emulators, existing historical data, no external model latency, no controlled background OS workload and no repeated-run confidence intervals. Numbers will change with Docker resources, platform emulation, outbox cadence, database size and concurrency. Production capacity needs sustained load, failure injection and multiple runs on declared hardware.
