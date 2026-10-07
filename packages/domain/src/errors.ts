import type { ExecutionStatus } from './execution.js'

export enum DomainErrorCode {
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  INVALID_EXECUTION_REQUEST = 'INVALID_EXECUTION_REQUEST',
  INVALID_BUDGET_POLICY = 'INVALID_BUDGET_POLICY',
  INVALID_ATTEMPT = 'INVALID_ATTEMPT',
}

export abstract class DomainError extends Error {
  public readonly code: DomainErrorCode

  protected constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = new.target.name
    this.code = code
  }
}

export class InvalidStateTransitionError extends DomainError {
  public readonly from: ExecutionStatus
  public readonly to: ExecutionStatus

  public constructor(from: ExecutionStatus, to: ExecutionStatus) {
    super(
      DomainErrorCode.INVALID_STATE_TRANSITION,
      `Invalid execution state transition from ${from} to ${to}`,
    )
    this.from = from
    this.to = to
  }
}

export class InvalidExecutionRequestError extends DomainError {
  public constructor(message: string) {
    super(DomainErrorCode.INVALID_EXECUTION_REQUEST, message)
  }
}

export class InvalidBudgetPolicyError extends DomainError {
  public constructor(message: string) {
    super(DomainErrorCode.INVALID_BUDGET_POLICY, message)
  }
}

export class InvalidAttemptError extends DomainError {
  public constructor(message: string) {
    super(DomainErrorCode.INVALID_ATTEMPT, message)
  }
}

export function domainErrorCodeLabel(code: DomainErrorCode): string {
  switch (code) {
    case DomainErrorCode.INVALID_STATE_TRANSITION:
      return 'Invalid state transition'
    case DomainErrorCode.INVALID_EXECUTION_REQUEST:
      return 'Invalid execution request'
    case DomainErrorCode.INVALID_BUDGET_POLICY:
      return 'Invalid budget policy'
    case DomainErrorCode.INVALID_ATTEMPT:
      return 'Invalid attempt'
    default:
      return assertNever(code)
  }
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`)
}
