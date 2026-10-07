# MockProvider

MockProvider requires no credentials and never calls an external API. Its operation or `input.scenario` selects a deterministic scenario:

- `success`, `estimated_cost`, `measured_cost`
- `transient_failure` (fails the first attempt, then succeeds)
- `permanent_failure`
- `rate_limit` (fails with a one-second retry hint, then succeeds)
- `timeout` (returns a retryable timeout)
- `slow_response`, `cancellation`
- `malformed_response`
- `budget_overrun`
- `dead_letter` (retryable failures through the attempt limit)

Inputs can set `estimatedCostUsd`, `measuredCostUsd`, `failUntilAttempt` and a bounded `delayMs`. Slow scenarios use an injectable sleep function. Cancellation is execution-scoped and is checked before execution and after the injected delay. Health time is injectable.

All mock costs are synthetic scenario values, not charges or measurements from a real provider. Estimated-only scenarios omit measured cost entirely. Budget-overrun scenarios return a higher synthetic measured amount so the worker can demonstrate post-execution governance. Output records identify themselves as simulated and do not echo input payloads.

Provider normalization validates successful output, failure shape and cost values. Malformed responses are rejected and become safe permanent provider errors at the worker boundary.
