# Budget control

API defaults: maximum estimated/recorded cost $1, duration 60 seconds, three attempts, ten tool calls. Validated overrides are bounded (cost at most $100, duration at most one hour, attempts at most ten, calls at most 100). Demo Lab uses smaller scenario-specific limits and synthetic estimates/charges.

Domain admission checks prior usage and the next estimate, emits warning facts near configured thresholds, and rejects exceeded cost/duration/attempt/tool-call limits. Unknown estimates are represented as unknown rather than zero. Measured costs are exact integer micro-dollars in PostgreSQL and API string totals, separate from estimates. UI decimal displays are presentation values.

An estimate is not a payment guarantee. Measured overrun remains recorded and terminates the execution with a budget-exceeded fact. Cancellation cannot recall an already-submitted provider call. Sapiom cost estimation/measurement capabilities are explicitly false until a verified price contract is integrated. An unknown-price provider therefore cannot guarantee a monetary hard cap.
