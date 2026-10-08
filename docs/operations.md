# Operational workflows

Overview uses PostgreSQL counts across all persisted history, separate estimated/measured sums and terminal wall-duration percentiles. The chart covers the last 24 hours in UTC with explicit zero-count buckets, grouped by execution creation hour and current outcome. Rates use all executions as their denominator, including active work.

Execution detail polls active work, renders every persisted fact in sequence order, groups facts by attempts and shows a dashed retry edge. Graph nodes reveal actual payloads. Cancel is offered only for active states; Retry only for failed/dead-letter/budget-exceeded executions; replay only for terminal sources. Every retry/replay action creates a new execution. Simulation replay selects MockProvider; input replay retains the original provider and can invoke Sapiom when explicitly enabled. The original history remains unchanged.

Dead Letter lists immutable historical records, including requeued records. Inspect opens the original execution, simulation replay creates a mock execution, and requeue creates one linked replacement. Existing requeues are inspectable rather than repeatedly recreated.

Demo Lab queues ten real MockProvider scenarios through the same API, durable outbox, Service Bus emulator and worker as regular executions. Replay waits for its successful source then creates a simulation replay. Cancellation exposes a five-second in-flight mock call. Costs are synthetic, including overrun and warning scenarios.

Observability shows persisted latency/error/retry/tool-call counts, average creation throughput over 24 hours and pending durable outbox records. Transport queue depth is explicitly unavailable because the emulator's SDK counter is unsupported. Grafana/Prometheus/Tempo use real telemetry. Execution trace links use persisted trace IDs; expired telemetry can be absent even when events remain.

Settings exposes provider capabilities/configuration and individual dependency probes without credentials. Sapiom configuration is not a paid live health probe. Dependency readiness does not certify worker liveness. Azure deployment is disabled in this local runtime.

The console provides keyboard navigation, a focus-trapped command palette with focus restoration, accessible detail tabs, responsive navigation and reduced-motion styling. Browser acceptance tests exercise the real local system and capture screenshots under `docs/screenshots/`.
