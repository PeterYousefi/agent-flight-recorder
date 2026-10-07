import type { ExecutionStatus } from './execution.js'

export enum DomainErrorCode {
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  INVALID_EXECUTION_REQUEST = 'INVALID_EXECUTION_REQUEST',
  INVALID_BUDGET_POLICY = 'INVALID_BUDGET_POLICY',
  INVALID_ATTEMPT = 'INVALID_ATTEMPT',
  INVALID_EVENT = 'INVALID_EVENT',
  UNSUPPORTED_EVENT_SCHEMA = 'UNSUPPORTED_EVENT_SCHEMA',
  INVALID_EVENT_SEQUENCE = 'INVALID_EVENT_SEQUENCE',
  INVALID_EVENT_STREAM = 'INVALID_EVENT_STREAM',
  INVALID_CONTRACT = 'INVALID_CONTRACT',
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

export class InvalidEventError extends DomainError {
  public constructor(message: string) {
    super(DomainErrorCode.INVALID_EVENT, message)
  }
}

export class UnsupportedEventSchemaError extends DomainError {
  public readonly schemaVersion: number

  public constructor(schemaVersion: number) {
    super(
      DomainErrorCode.UNSUPPORTED_EVENT_SCHEMA,
      `Unsupported event schema version ${schemaVersion}`,
    )
    this.schemaVersion = schemaVersion
  }
}

export class InvalidEventSequenceError extends DomainError {
  public constructor(message: string) {
    super(DomainErrorCode.INVALID_EVENT_SEQUENCE, message)
  }
}

export class InvalidEventStreamError extends DomainError {
  public constructor(message: string) {
    super(DomainErrorCode.INVALID_EVENT_STREAM, message)
  }
}

export class InvalidContractError extends DomainError {
  public constructor(message: string) {
    super(DomainErrorCode.INVALID_CONTRACT, message)
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
    case DomainErrorCode.INVALID_EVENT:
      return 'Invalid event'
    case DomainErrorCode.UNSUPPORTED_EVENT_SCHEMA:
      return 'Unsupported event schema'
    case DomainErrorCode.INVALID_EVENT_SEQUENCE:
      return 'Invalid event sequence'
    case DomainErrorCode.INVALID_EVENT_STREAM:
      return 'Invalid event stream'
    case DomainErrorCode.INVALID_CONTRACT:
      return 'Invalid contract value'
    default:
      return assertNever(code)
  }
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`)
}
