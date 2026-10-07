# ADR 0003 — Message Bus Abstraction and Transport Selection

**Date:** 2026-10-06  
**Status:** Accepted

## Context

The worker architecture requires a reliable message queue with:

- At-least-once delivery semantics
- Dead-letter support for terminal failures
- Delayed/scheduled re-delivery for retry backoff
- Visibility timeout to prevent concurrent processing of the same message
- Local development without Azure credentials
- A clear path to Azure Service Bus in production

The queue transport must not leak into domain or application logic. If we ever swap the transport, only the adapter changes.

## Decision

**Define a `MessageBus` interface in `packages/domain`. Provide two implementations: `InMemoryMessageBus` for unit tests and `ServiceBusMessageBus` wrapping `@azure/service-bus` for local emulator and production.**

```typescript
// packages/domain/src/messaging.ts

export interface Message<T = unknown> {
  id: string
  body: T
  attributes: Record<string, string> // carries OTel trace context
  enqueuedAt: Date
  deliveryCount: number
}

export type MessageHandler<T = unknown> = (message: Message<T>) => Promise<void>

export interface MessageBus {
  publish(
    queue: string,
    message: Omit<Message, 'enqueuedAt' | 'deliveryCount'>,
    options?: PublishOptions,
  ): Promise<void>
  subscribe(
    queue: string,
    handler: MessageHandler,
    options?: SubscribeOptions,
  ): Promise<Subscription>
  deadLetter(messageId: string, reason: string, description?: string): Promise<void>
  close(): Promise<void>
}

export interface PublishOptions {
  scheduledEnqueueTimeUtc?: Date // for delayed retry
  sessionId?: string
}

export interface SubscribeOptions {
  maxConcurrentCalls?: number
  lockDurationSeconds?: number
}
```

Ack/nack is handled implicitly: resolving the handler acks, throwing causes nack with requeue, and calling `deadLetter()` explicitly moves to dead-letter queue.

### Local transport: Azure Service Bus emulator

The official Microsoft Azure Service Bus emulator (`mcr.microsoft.com/azure-messaging/servicebus-emulator`) runs in Docker alongside a SQL Server Linux sidecar. It accepts the standard `@azure/service-bus` SDK connection string with `UseDevelopmentEmulator=true`. This is the primary local transport.

### Test transport: InMemoryMessageBus

A pure in-memory implementation for unit and integration tests that do not need the full Service Bus semantics. Zero external dependencies, fully synchronous-capable, supports dead-letter inspection.

### Production transport: Azure Service Bus

The same `ServiceBusMessageBus` implementation targets a real Azure Service Bus namespace by changing the connection string. No code changes required.

## Rationale

### Why Azure Service Bus over RabbitMQ

- Direct architectural mapping to Azure production deployment. Using RabbitMQ locally would require an additional adapter swap for production.
- The official Microsoft emulator is purpose-built for this use case.
- Azure Service Bus has native dead-letter queues, scheduled enqueue (for retry delays), and message lock semantics that map cleanly to the execution model.
- The `@azure/service-bus` SDK is well-maintained, TypeScript-first, and supports the emulator via `UseDevelopmentEmulator=true`.

### Why not Redis Streams or BullMQ

- Redis adds another dependency that provides no Azure mapping story.
- BullMQ is a good tool for pure Node.js job queues but adds queue-specific abstractions (jobs, workers, queues) that would clash with the `MessageBus` interface design.
- Explicitly not chosen because Redis does not appear in the target Azure deployment architecture.

### Why the abstraction matters

Without the `MessageBus` interface, `@azure/service-bus` types would appear in worker code, making it impossible to unit test message handling logic without a running Service Bus instance. The abstraction allows:

- Workers to be unit tested with `InMemoryMessageBus`
- Integration tests to use `InMemoryMessageBus` or the real emulator
- Production to use the real Azure Service Bus without code changes

## Service Bus Emulator Specifics

- Image: `mcr.microsoft.com/azure-messaging/servicebus-emulator:latest`
- Requires: `mcr.microsoft.com/mssql/server:2022-latest` as sidecar (internal dependency)
- Health endpoint: `http://localhost:5300/health`
- Entities configured via `infra/local/servicebus-config.json`
- Connection string pattern: `Endpoint=sb://servicebus-emulator;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;`

## Consequences

- The Service Bus emulator requires Docker and ~1GB RAM for the SQL Server sidecar. This is documented in prerequisites.
- `InMemoryMessageBus` does not replicate all Service Bus semantics (sessions, topic subscriptions, DLQ TTL). Tests that depend on these semantics must use the emulator.
- The `scheduledEnqueueTimeUtc` option on publish enables retry backoff without a separate delay service. This is a key capability that drove the Service Bus selection.
