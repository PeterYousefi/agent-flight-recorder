import type { ExecutionDto, CostDto, EventDto } from './api'
export type ExecutionStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'waiting'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'budget_exceeded'
  | 'dead_lettered'
export type EventStatus = 'success' | 'failure' | 'info' | 'warning' | 'running'
export type TimelineEventType =
  | 'created'
  | 'queued'
  | 'started'
  | 'model_request'
  | 'tool_call'
  | 'retry_scheduled'
  | 'budget_warning'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'waiting'
  | 'artifact'
  | 'dead_lettered'
  | 'replayed'
export interface TimelineEvent {
  id: string
  type: TimelineEventType
  label: string
  offsetMs: number
  durationMs?: number
  status: EventStatus
  attempt: number
  meta?: string
  details?: Record<string, unknown>
}
export interface Execution {
  id: string
  agent: string
  provider: string
  operation: string
  status: ExecutionStatus
  durationMs: number
  estimatedCostUsd: number | null
  measuredCostUsd: number | null
  attempts: number
  maxAttempts: number | null
  startedAt: string
  replayOf?: string
}
const statuses: Record<ExecutionDto['status'], ExecutionStatus> = {
  PENDING: 'pending',
  QUEUED: 'queued',
  RUNNING: 'running',
  WAITING: 'waiting',
  RETRY_SCHEDULED: 'retrying',
  SUCCEEDED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  BUDGET_EXCEEDED: 'budget_exceeded',
  DEAD_LETTERED: 'dead_lettered',
}
export function usd(micro: string | null | undefined): number | null {
  return micro === null || micro === undefined ? null : Number(micro) / 1000000
}
export function project(execution: ExecutionDto, cost?: CostDto): Execution {
  return {
    id: execution.id,
    agent: execution.agent_id,
    provider: execution.provider,
    operation: execution.operation,
    status: statuses[execution.status],
    durationMs: Math.max(0, Date.parse(execution.updated_at) - Date.parse(execution.created_at)),
    estimatedCostUsd: usd(cost?.estimated_micro_usd ?? execution.summary?.estimated_micro_usd),
    measuredCostUsd: usd(cost?.measured_micro_usd ?? execution.summary?.measured_micro_usd),
    attempts: execution.attempts?.length ?? execution.summary?.attempt_count ?? 0,
    maxAttempts: execution.budget_policy.max_attempts ?? null,
    startedAt: execution.created_at,
    ...(execution.original_execution_id === null
      ? {}
      : { replayOf: execution.original_execution_id }),
  }
}
export function fmtDuration(ms: number | null): string {
  return ms === null ? '—' : ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`
}
export function fmtCost(value: number | null): string {
  return value === null ? 'Unknown' : `$${value.toFixed(4)}`
}
export function fmtRelative(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000))
  return minutes < 1
    ? 'just now'
    : minutes < 60
      ? `${minutes}m ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : `${Math.floor(minutes / 1440)}d ago`
}
export function fmtTime(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + 'Z'
}

export function timeline(events: EventDto[], start: string): TimelineEvent[] {
  let attempt = 0
  const types: Record<string, [TimelineEventType, string, EventStatus]> = {
    'execution.created': ['created', 'Execution created', 'info'],
    'execution.queued': ['queued', 'Queued for worker', 'info'],
    'execution.started': ['started', 'Attempt started', 'running'],
    'execution.waiting': ['waiting', 'Waiting on dependency', 'info'],
    'execution.retry_scheduled': ['retry_scheduled', 'Retry scheduled', 'warning'],
    'execution.succeeded': ['completed', 'Execution succeeded', 'success'],
    'execution.failed': ['failed', 'Attempt failed', 'failure'],
    'execution.cancelled': ['cancelled', 'Execution cancelled', 'warning'],
    'execution.budget_exceeded': ['failed', 'Budget exceeded', 'failure'],
    'execution.dead_lettered': ['dead_lettered', 'Dead letter recorded', 'failure'],
    'execution.replayed': ['replayed', 'Replay linked to original', 'info'],
    'tool.requested': ['model_request', 'Provider call requested', 'info'],
    'tool.started': ['tool_call', 'Provider call started', 'running'],
    'tool.succeeded': ['completed', 'Provider call succeeded', 'success'],
    'tool.failed': ['failed', 'Provider call failed', 'failure'],
    'artifact.persisted': ['artifact', 'Private artifact persisted', 'success'],
    'budget.warning': ['budget_warning', 'Budget warning', 'warning'],
  }
  return [...events]
    .sort((a, b) => a.sequence - b.sequence)
    .map((event) => {
      const payload = event.payload
      if (event.event_type === 'execution.started' && typeof payload.attemptNumber === 'number')
        attempt = payload.attemptNumber
      const [type, label, status] = types[event.event_type] ?? ['waiting', event.event_type, 'info']
      const error = payload.error
      const reason =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : typeof payload.reason === 'string'
            ? payload.reason
            : typeof payload.budgetType === 'string'
              ? `${payload.budgetType} · observed ${String(payload.observed)} / limit ${String(payload.limit ?? payload.threshold)}`
              : event.event_type
      return {
        id: event.event_id,
        type,
        label,
        status:
          status === 'running' && event.sequence !== events.at(-1)?.sequence ? 'info' : status,
        attempt,
        offsetMs: Math.max(0, Date.parse(event.timestamp) - Date.parse(start)),
        ...(typeof payload.durationMs === 'number' ? { durationMs: payload.durationMs } : {}),
        meta: `#${event.sequence} · ${reason}${typeof payload.nextRetryAt === 'string' ? ` · next ${fmtTime(payload.nextRetryAt)}` : ''}`,
        details: {
          ...payload,
          timestamp: event.timestamp,
          sequence: event.sequence,
          correlation: event.correlation ?? {},
        },
      }
    })
}
