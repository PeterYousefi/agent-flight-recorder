import type { ExecutionDto, CostDto } from './api'
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
