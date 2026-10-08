# Event model

Each immutable fact has an event UUID, execution UUID, type, authoritative per-execution sequence, UTC timestamp, schema version, typed payload and optional trace/span/correlation metadata. Domain constructors validate payload meaning and complete event-stream ordering; PostgreSQL uniquely constrains sequence and serializes append/update operations under execution locks.

Schema version 1 includes execution creation, queue/start/wait/retry/success/failure/cancel/budget-exceeded/dead-letter/replay facts; tool requested/started/succeeded/failed; artifact persisted; and budget warning. Adding optional fields preserves compatibility; changing required meaning requires a new supported schema version. Unknown versions are rejected.

The API serializes envelope fields as snake_case. Payloads and opaque artifact/input JSON retain their original keys and are not recursively renamed. The UI orders by sequence and derives attempt groups from start facts; timestamps display durations rather than replacing sequence as ordering authority. No tool/provider fact is fabricated by the visualizer.

Trace correlation is optional, best-effort metadata. Fact persistence does not depend on Tempo, Prometheus or the Collector succeeding. Replay linkage is a fact on the new execution; terminal original history is immutable.
