import {
  context,
  propagation,
  trace,
  SpanStatusCode,
  SpanKind,
  type Attributes,
  type Context,
} from '@opentelemetry/api'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base'

/** Cloud sandbox uses manual spans and log streaming without paid ingestion. */
export function startCloudTelemetry(serviceName: string): NodeSDK {
  const sdk = new NodeSDK({
    autoDetectResources: false,
    resource: resourceFromAttributes({
      'service.name': serviceName,
      'deployment.environment.name': 'azure-demo',
    }),
    traceExporter: new ConsoleSpanExporter(),
  })
  sdk.start()
  return sdk
}

export function startTelemetry(
  serviceName: string,
  endpoint = 'http://localhost:4318',
  environment = 'local',
): NodeSDK {
  const url = new URL(endpoint)
  if (
    !['localhost', '127.0.0.1', 'otel-collector'].includes(url.hostname) ||
    url.protocol !== 'http:'
  )
    throw new Error('Telemetry endpoint must be local')
  const sdk = new NodeSDK({
    autoDetectResources: false,
    resource: resourceFromAttributes({
      'service.name': serviceName,
      'deployment.environment.name': environment,
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, timeoutMillis: 5000 }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics`, timeoutMillis: 5000 }),
      exportIntervalMillis: 5000,
    }),
    // Manual instrumentation only: no request bodies, SQL, auth headers or
    // environment credentials captured by automatic instrumentation.
  })
  sdk.start()
  return sdk
}
// Preserve typed application errors without ever recording their raw messages.
export async function traced<T>(
  name: string,
  attributes: Attributes,
  work: () => Promise<T>,
  parent: Context = context.active(),
  kind = SpanKind.INTERNAL,
): Promise<T> {
  return trace
    .getTracer('agent-flight-recorder', '1.0.0')
    .startActiveSpan(name, { attributes, kind }, parent, async (active) => {
      try {
        return await work()
      } catch (error) {
        active.setStatus({ code: SpanStatusCode.ERROR, message: 'Operation failed' })
        throw error
      } finally {
        active.end()
      }
    })
}
export function traceContext(): { traceparent?: string } {
  const carrier: Record<string, string> = {}
  propagation.inject(context.active(), carrier)
  return carrier.traceparent === undefined ? {} : { traceparent: carrier.traceparent }
}
export function correlation(): { traceId?: string; spanId?: string } {
  const active = trace.getSpan(context.active())?.spanContext()
  return active === undefined || active.traceId === '00000000000000000000000000000000'
    ? {}
    : { traceId: active.traceId, spanId: active.spanId }
}
export function parentContext(traceparent?: string): Context {
  return traceparent === undefined
    ? context.active()
    : propagation.extract(context.active(), { traceparent })
}
export interface SafeLogFields {
  readonly execution_id?: string
  readonly request_id?: string
  readonly status?: string
  readonly event_type?: string
  readonly sequence?: number
}
export function log(event: string, fields: SafeLogFields = {}): void {
  // Allowlist fields rather than attempting to redact arbitrary user payloads.
  const { execution_id, request_id, status, event_type, sequence } = fields
  process.stdout.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', event, execution_id, request_id, status, event_type, sequence, ...correlation() })}\n`,
  )
}
