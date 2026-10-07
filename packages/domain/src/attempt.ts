import { InvalidAttemptError } from './errors.js'

export enum AttemptStatus {
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface ExecutionAttempt {
  readonly id: string
  readonly executionId: string
  readonly attemptNumber: number
  readonly status: AttemptStatus
  readonly startedAt: Date
  readonly completedAt?: Date
  readonly leaseExpiresAt?: Date
  readonly errorCode?: string
  readonly errorMessage?: string
  readonly retryable?: boolean
}

export function createExecutionAttempt(value: unknown): ExecutionAttempt {
  if (!isRecord(value)) {
    throw new InvalidAttemptError('Execution attempt must be an object')
  }

  const id = readRequiredString(value, 'id')
  const executionId = readRequiredString(value, 'executionId')
  const attemptNumber = value.attemptNumber
  if (typeof attemptNumber !== 'number' || !Number.isInteger(attemptNumber) || attemptNumber <= 0) {
    throw new InvalidAttemptError('attemptNumber must be a positive integer')
  }

  const status = value.status
  if (!isAttemptStatus(status)) {
    throw new InvalidAttemptError('status must be a valid attempt status')
  }

  const startedAt = readDate(value, 'startedAt')
  const completedAt = value.completedAt === undefined ? undefined : readDate(value, 'completedAt')
  if (completedAt !== undefined && completedAt < startedAt) {
    throw new InvalidAttemptError('completedAt cannot precede startedAt')
  }

  return Object.freeze({
    id,
    executionId,
    attemptNumber,
    status,
    startedAt: new Date(startedAt.getTime()),
    ...(value.leaseExpiresAt === undefined
      ? {}
      : { leaseExpiresAt: readDate(value, 'leaseExpiresAt') }),
    ...(completedAt === undefined ? {} : { completedAt: new Date(completedAt.getTime()) }),
    ...(typeof value.errorCode === 'string' ? { errorCode: value.errorCode } : {}),
    ...(typeof value.errorMessage === 'string' ? { errorMessage: value.errorMessage } : {}),
    ...(typeof value.retryable === 'boolean' ? { retryable: value.retryable } : {}),
  })
}

function readRequiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidAttemptError(`${field} must be a non-empty string`)
  }

  return value
}

function readDate(record: Record<string, unknown>, field: string): Date {
  const value = record[field]
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new InvalidAttemptError(`${field} must be a valid Date`)
  }

  return value
}

function isAttemptStatus(value: unknown): value is AttemptStatus {
  return Object.values(AttemptStatus).includes(value as AttemptStatus)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
