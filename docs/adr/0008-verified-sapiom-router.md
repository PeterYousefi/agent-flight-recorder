# ADR 0008 — Verified Sapiom Router adapter

Date: 2026-10-07. Status: Accepted.

The earlier integration document described planned SDK calls as if an adapter existed. No Sapiom adapter had been implemented. The current official Router reference provides a narrow HTTP contract suitable for an external execution provider.

Use the documented non-streaming chat endpoint behind ExecutionProvider. Keep authentication in environment variables and keep Sapiom types out of application code. Do not fabricate dollar costs, server cancellation, remote health probes or external idempotency guarantees.

The generic provider port and existing architecture remain unchanged. SDK capability execution remains future work requiring verification against a pinned SDK's declarations. Local development remains credential-free and Sapiom is disabled by default.
