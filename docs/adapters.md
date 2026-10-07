# In-memory development adapters

`@afr/adapters` supplies deterministic MessageBus and ArtifactStore implementations for development and tests. Execution persistence always remains PostgreSQL.

The in-memory bus buffers messages until subscribed. Call `drain()` explicitly to deliver messages ready at the start of that tick. ACK removes a message; RETRY delays it using an injected clock; DEAD_LETTER records the rejected message. Handler exceptions use bounded retry without recording exception contents. Default transport policy is ten deliveries with a one-second delay. Publishing duplicate message IDs deliberately permits duplicate delivery so workers must remain idempotent. Consumer concurrency is bounded; closing a subscription preserves pending messages, and shutdown waits for active delivery.

The artifact store accepts private JSON content with a default one-MiB limit. IDs and time can be injected. Size counts UTF-8 bytes, checksums use SHA-256, and supplied checksums must match. Retrieval verifies execution ownership and kind. Reads return copies, and missing references produce typed errors. This store is process-local and loses artifacts on restart; use the Azurite adapter for durable local demos once available.
