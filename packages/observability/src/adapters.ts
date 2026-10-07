import { SpanKind } from '@opentelemetry/api'
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
  return {
    publish: (message) =>
      traced(
        'queue.publish',
        { 'execution.id': message.executionId, 'messaging.system': 'servicebus' },
        () => bus.publish(createMessageEnvelope({ ...message, ...traceContext() })),
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
            () => Promise.resolve(handler(message)),
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
