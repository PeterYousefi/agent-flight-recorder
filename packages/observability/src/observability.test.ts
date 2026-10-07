import { describe, expect, it } from 'vitest'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { observeBus } from './adapters.js'
import { correlation, traced, traceContext } from './tracing.js'
import {
  createMessageEnvelope,
  type MessageBus,
  type MessageEnvelope,
  type MessageHandler,
  type JsonValue,
  type Subscription,
} from '@afr/domain'
import { InMemoryMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { ExecutionMetrics } from './metrics.js'
import { createExecutionEvent, ExecutionEventType } from '@afr/domain'

describe('manual observability with payload allowlists', () => {
  it('propagates producer/consumer parentage, preserves typed errors and omits sensitive input', async () => {
    const exporter = new InMemorySpanExporter()
    const metrics = new InMemoryMetricExporter(1)
    const reader = new PeriodicExportingMetricReader({
      exporter: metrics,
      exportIntervalMillis: 60000,
    })
    const sdk = new NodeSDK({
      autoDetectResources: false,
      spanProcessor: new SimpleSpanProcessor(exporter),
      metricReader: reader,
    })
    sdk.start()
    try {
      let queued: MessageEnvelope | undefined
      const transport: MessageBus = {
        publish: async (message) => {
          queued = message as MessageEnvelope
        },
        subscribe: async <T extends JsonValue>(
          handler: MessageHandler<T>,
        ): Promise<Subscription> => {
          if (queued !== undefined) await handler(queued as MessageEnvelope<T>)
          return { close: async () => undefined }
        },
      }
      const bus = observeBus(transport)
      let sourceTrace: string | undefined
      await traced('execution.create', {}, async () => {
        sourceTrace = correlation().traceId
        await bus.publish(
          createMessageEnvelope({
            messageId: 'message',
            executionId: 'execution',
            messageType: 'fixture',
            schemaVersion: 1,
            createdAt: new Date().toISOString(),
            payload: { private_value: 'do-not-export' },
            ...traceContext(),
          }),
        )
      })
      await bus.subscribe(async () => {
        expect(correlation().traceId).toBe(sourceTrace)
        return { kind: 'ACK' }
      })
      const error = Object.assign(new Error('do-not-export'), { code: 'CONFLICT' })
      await expect(
        traced('failure', {}, async () => {
          throw error
        }),
      ).rejects.toBe(error)
      const spans = exporter.getFinishedSpans()
      expect(spans.map((s) => s.name)).toEqual([
        'queue.publish',
        'execution.create',
        'queue.consume',
        'failure',
      ])
      expect(spans[0]?.spanContext().traceId).toBe(sourceTrace)
      expect(spans[2]?.parentSpanContext?.spanId).toBe(spans[0]?.spanContext().spanId)
      expect(
        JSON.stringify(
          spans.map((s) => ({ attributes: s.attributes, events: s.events, status: s.status })),
        ),
      ).not.toContain('do-not-export')
      const instrumentation = new ExecutionMetrics()
      instrumentation.committed(
        [
          {
            event: createExecutionEvent({
              eventId: 'fact',
              executionId: 'execution',
              eventType: ExecutionEventType.EXECUTION_SUCCEEDED,
              sequence: 2,
              timestamp: new Date().toISOString(),
              payload: { attemptNumber: 1 },
            }),
            elapsedSeconds: 2,
          },
        ],
        [],
      )
      await reader.forceFlush()
      expect(
        metrics
          .getMetrics()
          .flatMap((m) => m.scopeMetrics.flatMap((s) => s.metrics.map((v) => v.descriptor.name))),
      ).toContain('execution_duration_seconds')
    } finally {
      await sdk.shutdown()
    }
  })
})
