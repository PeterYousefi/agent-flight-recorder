import { createBudgetPolicy, type BudgetPolicy } from './budget.js'
import { InvalidBudgetPolicyError, InvalidExecutionRequestError } from './errors.js'

export enum ExecutionStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  WAITING = 'WAITING',
  RETRY_SCHEDULED = 'RETRY_SCHEDULED',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  BUDGET_EXCEEDED = 'BUDGET_EXCEEDED',
  DEAD_LETTERED = 'DEAD_LETTERED',
}

export enum ReplayMode {
  INPUT = 'input',
  SIMULATION = 'simulation',
}

export type ExecutionInput = Readonly<Record<string, unknown>>
export type ExecutionMetadata = Readonly<Record<string, unknown>>

export interface ExecutionRequest {
  readonly agentId: string
  readonly provider: string
  readonly operation: string
  readonly input: ExecutionInput
  readonly budgetPolicy: BudgetPolicy
  readonly idempotencyKey?: string
  readonly metadata?: ExecutionMetadata
}

export interface Execution {
  readonly id: string
  readonly status: ExecutionStatus
  readonly request: ExecutionRequest
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly originalExecutionId?: string
  readonly replayMode?: ReplayMode
}

export function createExecutionRequest(value: unknown): ExecutionRequest {
  if (!isRecord(value)) {
    throw new InvalidExecutionRequestError('Execution request must be an object')
  }

  const agentId = readRequiredString(value, 'agentId')
  const provider = readRequiredString(value, 'provider')
  const operation = readRequiredString(value, 'operation')
  const input = readRecord(value, 'input', 'Execution input')
  let budgetPolicy: BudgetPolicy
  try {
    budgetPolicy = createBudgetPolicy(value.budgetPolicy)
  } catch (error) {
    if (error instanceof InvalidBudgetPolicyError) {
      throw new InvalidExecutionRequestError(`budgetPolicy is invalid: ${error.message}`)
    }
    throw error
  }
  const idempotencyKey = readOptionalString(value, 'idempotencyKey')
  const metadata = readOptionalRecord(value, 'metadata', 'Execution metadata')

  return Object.freeze({
    agentId,
    provider,
    operation,
    input: Object.freeze({ ...input }),
    budgetPolicy,
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    ...(metadata === undefined ? {} : { metadata: Object.freeze({ ...metadata }) }),
  })
}

export function createExecution(
  id: string,
  request: ExecutionRequest,
  now: Date = new Date(),
  relationship?: {
    readonly originalExecutionId?: string
    readonly replayMode?: ReplayMode
  },
): Execution {
  if (!isNonEmptyString(id)) {
    throw new InvalidExecutionRequestError('Execution id must be a non-empty string')
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new InvalidExecutionRequestError('Execution timestamp must be a valid date')
  }
  if (relationship?.originalExecutionId === id) {
    throw new InvalidExecutionRequestError('An execution cannot replay itself')
  }
  if (relationship?.replayMode !== undefined && relationship.originalExecutionId === undefined) {
    throw new InvalidExecutionRequestError('Replay mode requires an original execution id')
  }

  const timestamp = new Date(now.getTime())
  return Object.freeze({
    id,
    status: ExecutionStatus.PENDING,
    request,
    createdAt: timestamp,
    updatedAt: new Date(timestamp.getTime()),
    ...relationship,
  })
}

function readRequiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (!isNonEmptyString(value)) {
    throw new InvalidExecutionRequestError(`${field} must be a non-empty string`)
  }

  return value
}

function readOptionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field]
  if (value === undefined) {
    return undefined
  }
  if (!isNonEmptyString(value)) {
    throw new InvalidExecutionRequestError(`${field} must be a non-empty string`)
  }

  return value
}

function readRecord(
  record: Record<string, unknown>,
  field: string,
  label: string,
): Record<string, unknown> {
  const value = record[field]
  if (!isRecord(value)) {
    throw new InvalidExecutionRequestError(`${label} must be an object`)
  }

  return value
}

function readOptionalRecord(
  record: Record<string, unknown>,
  field: string,
  label: string,
): Record<string, unknown> | undefined {
  const value = record[field]
  if (value === undefined) {
    return undefined
  }
  if (!isRecord(value)) {
    throw new InvalidExecutionRequestError(`${label} must be an object`)
  }

  return value
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
