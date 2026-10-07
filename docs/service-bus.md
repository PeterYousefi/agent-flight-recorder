# Local Service Bus

`AzureServiceBus` implements the domain `MessageBus` using Microsoft's `@azure/service-bus` SDK. The v1 runtime accepts only emulator connection strings (`UseDevelopmentEmulator=true`); it does not create or use Azure cloud resources.

Host applications connect to `sb://localhost`, port 5672. Applications inside Compose connect to `sb://servicebus-emulator`. The static emulator authentication fields are documented public emulator values. Queue `executions` is provisioned in the checked-in emulator configuration. No application path creates a cloud namespace.

Publish carries the domain envelope, message ID, correlation ID and execution metadata. Consumers use peek-lock with automatic settlement disabled. ACK completes; RETRY waits ten seconds then abandons; DEAD_LETTER uses the transport dead-letter subqueue with a generic safe reason. Unexpected handler errors follow retry behavior without logging raw SDK exceptions. Application/provider retries are distinct: the durable database outbox controls their backoff. The transport delay avoids a hot loop while another worker owns an attempt lease. Emulator delivery limits eventually reject poison messages.

Subscription shutdown stops consumption and closes its receiver. Bus shutdown closes all receivers, sender and client. Queue readiness uses a bounded peek and does not consume messages. Domain dead-letter records and transport dead letters are distinct; operator requeue applies to persisted domain records.

Integration tests require `RUN_LOCAL_AZURE_TESTS=true pnpm --filter @afr/adapters test:integration`. They create a uniquely named local queue using emulator administration on port 5300, exercise redelivery/ACK/dead-letter settlement and shutdown, then delete only that queue. Normal unit tests skip these socket-dependent tests.

The official emulator and SQL Server images are amd64-only. On Apple Silicon enable Docker Desktop's x86/Rosetta emulation and allow sufficient memory. Emulation startup and performance depend on the machine; this repository makes no cloud-parity or fixed startup-latency claim.

The emulator's queue runtime-count response currently fails the SDK parser in local verification. Tests verify settlement by consuming/peeking the relevant queue rather than relying on those management counters. Queue-depth dashboards must label unavailable data instead of fabricating counts.

Sources: [Microsoft local emulator setup](https://learn.microsoft.com/en-us/azure/service-bus-messaging/test-locally-with-service-bus-emulator), [JavaScript SDK settlement API](https://learn.microsoft.com/en-us/javascript/api/@azure/service-bus/servicebusreceiver).
