import { assertNever, InvalidStateTransitionError } from './errors.js'
import { ExecutionStatus } from './execution.js'

export const VALID_TRANSITIONS: Readonly<Record<ExecutionStatus, readonly ExecutionStatus[]>> = {
  [ExecutionStatus.PENDING]: [ExecutionStatus.QUEUED],
  [ExecutionStatus.QUEUED]: [ExecutionStatus.RUNNING],
  [ExecutionStatus.RUNNING]: [
    ExecutionStatus.WAITING,
    ExecutionStatus.RETRY_SCHEDULED,
    ExecutionStatus.SUCCEEDED,
    ExecutionStatus.FAILED,
    ExecutionStatus.CANCELLED,
    ExecutionStatus.BUDGET_EXCEEDED,
  ],
  [ExecutionStatus.WAITING]: [],
  [ExecutionStatus.RETRY_SCHEDULED]: [ExecutionStatus.QUEUED],
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

export function transition(from: ExecutionStatus, to: ExecutionStatus): ExecutionStatus {
  if (!canTransitionTo(from, to)) {
    throw new InvalidStateTransitionError(from, to)
  }

  return to
}

export function isTerminal(status: ExecutionStatus): boolean {
  switch (status) {
    case ExecutionStatus.SUCCEEDED:
    case ExecutionStatus.FAILED:
    case ExecutionStatus.CANCELLED:
    case ExecutionStatus.BUDGET_EXCEEDED:
    case ExecutionStatus.DEAD_LETTERED:
      return true
    case ExecutionStatus.PENDING:
    case ExecutionStatus.QUEUED:
    case ExecutionStatus.RUNNING:
    case ExecutionStatus.WAITING:
    case ExecutionStatus.RETRY_SCHEDULED:
      return false
    default:
      return assertNever(status)
  }
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
