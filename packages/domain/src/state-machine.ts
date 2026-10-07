import { assertNever, InvalidStateTransitionError } from './errors.js'
import { ExecutionStatus } from './execution.js'

export const VALID_TRANSITIONS: Readonly<Record<ExecutionStatus, readonly ExecutionStatus[]>> = {
  [ExecutionStatus.PENDING]: [ExecutionStatus.QUEUED, ExecutionStatus.CANCELLED],
  [ExecutionStatus.QUEUED]: [ExecutionStatus.RUNNING, ExecutionStatus.CANCELLED],
  [ExecutionStatus.RUNNING]: [
    ExecutionStatus.WAITING,
    ExecutionStatus.RETRY_SCHEDULED,
    ExecutionStatus.SUCCEEDED,
    ExecutionStatus.FAILED,
    ExecutionStatus.CANCELLED,
    ExecutionStatus.BUDGET_EXCEEDED,
  ],
  [ExecutionStatus.WAITING]: [
    ExecutionStatus.RUNNING,
    ExecutionStatus.RETRY_SCHEDULED,
    ExecutionStatus.FAILED,
    ExecutionStatus.CANCELLED,
    ExecutionStatus.BUDGET_EXCEEDED,
  ],
  [ExecutionStatus.RETRY_SCHEDULED]: [ExecutionStatus.QUEUED, ExecutionStatus.CANCELLED],
  [ExecutionStatus.SUCCEEDED]: [],
  [ExecutionStatus.FAILED]: [ExecutionStatus.DEAD_LETTERED],
  [ExecutionStatus.CANCELLED]: [],
  [ExecutionStatus.BUDGET_EXCEEDED]: [],
  // A dead-lettered execution is terminal; requeue must create a new execution.
  [ExecutionStatus.DEAD_LETTERED]: [],
}

export function canTransitionTo(from: ExecutionStatus, to: ExecutionStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}

export const INITIAL_STATES: readonly ExecutionStatus[] = [ExecutionStatus.PENDING]

export const ACTIVE_STATES: readonly ExecutionStatus[] = [
  ExecutionStatus.QUEUED,
  ExecutionStatus.RUNNING,
]

export const BLOCKED_STATES: readonly ExecutionStatus[] = [ExecutionStatus.WAITING]

export const RETRY_STATES: readonly ExecutionStatus[] = [ExecutionStatus.RETRY_SCHEDULED]

export const TERMINAL_STATES: readonly ExecutionStatus[] = [
  ExecutionStatus.SUCCEEDED,
  ExecutionStatus.CANCELLED,
  ExecutionStatus.BUDGET_EXCEEDED,
  ExecutionStatus.DEAD_LETTERED,
]

export const FAILED_STATES: readonly ExecutionStatus[] = [ExecutionStatus.FAILED]

export type ExecutionStatusCategory =
  'initial' | 'active' | 'blocked' | 'retry' | 'failed' | 'terminal'

export function classifyStatus(status: ExecutionStatus): ExecutionStatusCategory {
  switch (status) {
    case ExecutionStatus.PENDING:
      return 'initial'
    case ExecutionStatus.QUEUED:
    case ExecutionStatus.RUNNING:
      return 'active'
    case ExecutionStatus.WAITING:
      return 'blocked'
    case ExecutionStatus.RETRY_SCHEDULED:
      return 'retry'
    case ExecutionStatus.FAILED:
      return 'failed'
    case ExecutionStatus.SUCCEEDED:
    case ExecutionStatus.CANCELLED:
    case ExecutionStatus.BUDGET_EXCEEDED:
    case ExecutionStatus.DEAD_LETTERED:
      return 'terminal'
    default:
      return assertNever(status)
  }
}

export function transition(from: ExecutionStatus, to: ExecutionStatus): ExecutionStatus {
  if (!canTransitionTo(from, to)) {
    throw new InvalidStateTransitionError(from, to)
  }

  return to
}

export function isTerminal(status: ExecutionStatus): boolean {
  return classifyStatus(status) === 'terminal'
}

export function statusLabel(status: ExecutionStatus): string {
  switch (status) {
    case ExecutionStatus.PENDING:
      return 'Pending'
    case ExecutionStatus.QUEUED:
      return 'Queued'
    case ExecutionStatus.RUNNING:
      return 'Running'
    case ExecutionStatus.WAITING:
      return 'Waiting'
    case ExecutionStatus.RETRY_SCHEDULED:
      return 'Retry scheduled'
    case ExecutionStatus.SUCCEEDED:
      return 'Succeeded'
    case ExecutionStatus.FAILED:
      return 'Failed'
    case ExecutionStatus.CANCELLED:
      return 'Cancelled'
    case ExecutionStatus.BUDGET_EXCEEDED:
      return 'Budget exceeded'
    case ExecutionStatus.DEAD_LETTERED:
      return 'Dead-lettered'
    default:
      return assertNever(status)
  }
}
