import { metrics } from '@opentelemetry/api'
import { ExecutionEventType, type ExecutionEvent, type CostRecord } from '@afr/domain'
import { log } from './tracing.js'
export interface ObservedFact {
  readonly event: ExecutionEvent
  readonly elapsedSeconds: number
}
export class ExecutionMetrics {
  private readonly meter = metrics.getMeter('agent-flight-recorder', '1.0.0')
  private readonly counters = new Map([
    [ExecutionEventType.EXECUTION_CREATED, this.meter.createCounter('executions_total')],
    [
      ExecutionEventType.EXECUTION_SUCCEEDED,
      this.meter.createCounter('executions_succeeded_total'),
    ],
    [ExecutionEventType.EXECUTION_FAILED, this.meter.createCounter('executions_failed_total')],
    [
      ExecutionEventType.EXECUTION_RETRY_SCHEDULED,
      this.meter.createCounter('execution_retry_total'),
    ],
    [ExecutionEventType.EXECUTION_REPLAYED, this.meter.createCounter('execution_replay_total')],
    [ExecutionEventType.EXECUTION_DEAD_LETTERED, this.meter.createCounter('dead_letter_total')],
    [
      ExecutionEventType.EXECUTION_BUDGET_EXCEEDED,
      this.meter.createCounter('budget_rejections_total'),
    ],
    [ExecutionEventType.TOOL_STARTED, this.meter.createCounter('tool_invocation_total')],
    [ExecutionEventType.TOOL_FAILED, this.meter.createCounter('provider_error_total')],
  ])
  private readonly duration = this.meter.createHistogram('execution_duration_seconds', {
    unit: 's',
    advice: { explicitBucketBoundaries: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 300] },
  })
  private readonly estimated = this.meter.createCounter('estimated_execution_cost', { unit: 'USD' })
  private readonly measured = this.meter.createCounter('measured_execution_cost', { unit: 'USD' })
  public committed(facts: readonly ObservedFact[], costs: readonly CostRecord[]): void {
    for (const { event, elapsedSeconds } of facts) {
      this.counters.get(event.eventType)?.add(1)
      if (
        [
          ExecutionEventType.EXECUTION_SUCCEEDED,
          ExecutionEventType.EXECUTION_DEAD_LETTERED,
          ExecutionEventType.EXECUTION_CANCELLED,
          ExecutionEventType.EXECUTION_BUDGET_EXCEEDED,
        ].includes(event.eventType)
      )
        this.duration.record(elapsedSeconds, { status: event.eventType.replace('execution.', '') })
      log('execution.fact', {
        execution_id: event.executionId,
        event_type: event.eventType,
        sequence: event.sequence,
      })
    }
    for (const cost of costs)
      (cost.kind === 'estimated' ? this.estimated : this.measured).add(
        Number(cost.amountMicroUsd) / 1000000,
      )
  }
}
