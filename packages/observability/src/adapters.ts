import { SpanKind, metrics } from '@opentelemetry/api'
import {
  createMessageEnvelope,
  type MessageBus,
  type JsonValue,
  type MessageHandler,
  type SubscriptionOptions,
  type Subscription,
  type ExecutionProvider,
  type ArtifactStore,
} from '@afr/domain'
import { traced, traceContext, parentContext } from './tracing.js'
export function observeBus(bus: MessageBus): MessageBus {
  const meter = metrics.getMeter('agent-flight-recorder', '1.0.0')
  const published = meter.createCounter('queue_published_total')
  const consumed = meter.createCounter('queue_consumed_total')
  const retried = meter.createCounter('queue_transport_retries_total')
  return {
    publish: (message) =>
      traced(
        'queue.publish',
        { 'execution.id': message.executionId, 'messaging.system': 'servicebus' },
        async () => {
          await bus.publish(createMessageEnvelope({ ...message, ...traceContext() }))
          published.add(1)
        },
        parentContext(message.traceparent),
        SpanKind.PRODUCER,
      ),
    subscribe: <T extends JsonValue>(
      handler: MessageHandler<T>,
      options?: SubscriptionOptions,
    ): Promise<Subscription> =>
      bus.subscribe<T>(
        (message) =>
          traced(
            'queue.consume',
            { 'execution.id': message.executionId, 'messaging.system': 'servicebus' },
            async () => {
              const result = await handler(message)
              consumed.add(1)
              if (result.kind === 'RETRY') retried.add(1)
              return result
            },
            parentContext(message.traceparent),
            SpanKind.CONSUMER,
          ),
        options,
      ),
  }
}
export function observeProvider(provider: ExecutionProvider): ExecutionProvider {
  return {
    name: provider.name,
    capabilities: provider.capabilities,
    validateRequest: (request) => provider.validateRequest(request),
    estimateCost: (request) =>
      traced(
        'provider.estimate',
        { 'execution.id': request.executionId, provider: provider.name },
        () => provider.estimateCost(request),
      ),
    execute: (request, ctx) =>
      traced(
        'attempt',
        {
          'execution.id': request.executionId,
          'attempt.id': ctx.attemptId,
          'attempt.number': request.attemptNumber,
        },
        () =>
          traced('provider.execute', { provider: provider.name }, () =>
            provider.execute(request, ctx),
          ),
      ),
    normalizeResult: (result) => provider.normalizeResult(result),
    healthCheck: () => provider.healthCheck(),
    ...(provider.cancel === undefined ? {} : { cancel: (id) => provider.cancel!(id) }),
  }
}
export function observeArtifacts(store: ArtifactStore): ArtifactStore {
  return {
    put: (input) =>
      traced(
        'artifact.put',
        { 'execution.id': input.executionId, 'artifact.kind': input.kind },
        () => store.put(input),
      ),
    get: (reference) =>
      traced(
        'artifact.get',
        { 'execution.id': reference.executionId, 'artifact.id': reference.artifactId },
        () => store.get(reference),
      ),
    delete: (reference) =>
      traced(
        'artifact.delete',
        { 'execution.id': reference.executionId, 'artifact.id': reference.artifactId },
        () => store.delete(reference),
      ),
  }
}
