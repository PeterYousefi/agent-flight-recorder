import {
  InvalidEventError,
  InvalidEventSequenceError,
  UnsupportedEventSchemaError,
} from './errors.js'
import type { BudgetPolicy } from './budget.js'

// Version changes are required when payload meaning or required fields change.
// Adding optional fields without changing existing meaning is backward-compatible.
export const CURRENT_EVENT_SCHEMA_VERSION = 1 as const
export const SUPPORTED_EVENT_SCHEMA_VERSIONS: readonly number[] = [CURRENT_EVENT_SCHEMA_VERSION]

export enum ExecutionEventType {
  EXECUTION_CREATED = 'execution.created',
  EXECUTION_QUEUED = 'execution.queued',
  EXECUTION_STARTED = 'execution.started',
  EXECUTION_WAITING = 'execution.waiting',
  EXECUTION_RETRY_SCHEDULED = 'execution.retry_scheduled',
  EXECUTION_SUCCEEDED = 'execution.succeeded',
  EXECUTION_FAILED = 'execution.failed',
  EXECUTION_CANCELLED = 'execution.cancelled',
  EXECUTION_BUDGET_EXCEEDED = 'execution.budget_exceeded',
  EXECUTION_DEAD_LETTERED = 'execution.dead_lettered',
  EXECUTION_REPLAYED = 'execution.replayed',
  TOOL_REQUESTED = 'tool.requested',
  TOOL_STARTED = 'tool.started',
  TOOL_SUCCEEDED = 'tool.succeeded',
  TOOL_FAILED = 'tool.failed',
  ARTIFACT_PERSISTED = 'artifact.persisted',
  BUDGET_WARNING = 'budget.warning',
}

export interface CorrelationMetadata {
  readonly correlationId?: string
  readonly causationEventId?: string
  readonly traceId?: string
  readonly spanId?: string
}

export interface EventError {
  readonly code: string
  readonly message: string
  readonly retryable: boolean
}

export interface ExecutionCreatedPayload {
  readonly agentId: string
  readonly provider: string
  readonly operation: string
  readonly budgetPolicy: BudgetPolicy
  readonly originalExecutionId?: string
  readonly replayMode?: 'input' | 'simulation'
}

export interface ExecutionQueuedPayload {
  readonly queueName: string
}

export interface ExecutionStartedPayload {
  readonly attemptNumber: number
}

export interface ExecutionWaitingPayload {
  readonly reason: string
  readonly dependencyType: 'external' | 'tool' | 'async'
}

export interface ExecutionRetryScheduledPayload {
  readonly attemptNumber: number
  readonly reason: string
  readonly retryable: true
  readonly nextRetryAt: string
}

export interface ExecutionSucceededPayload {
  readonly attemptNumber: number
  readonly measuredCostUsd?: number
}

export interface ExecutionFailedPayload {
  readonly attemptNumber: number
  readonly error: EventError
}

export interface ExecutionCancelledPayload {
  readonly reason?: string
}

export interface ExecutionBudgetExceededPayload {
  readonly budgetType: 'cost' | 'duration' | 'attempts' | 'tool_calls'
  readonly limit: number
  readonly observed: number
}

export interface ExecutionDeadLetteredPayload {
  readonly reason: string
  readonly attemptNumber: number
  readonly error?: EventError
}

export interface ExecutionReplayedPayload {
  readonly originalExecutionId: string
  readonly replayExecutionId: string
  readonly replayMode: 'input' | 'simulation'
}

export interface ToolRequestedPayload {
  readonly toolName: string
  readonly toolInvocationId: string
  readonly attemptNumber: number
}

export interface ToolStartedPayload {
  readonly toolName: string
  readonly toolInvocationId: string
  readonly attemptNumber: number
}

export interface ToolSucceededPayload {
  readonly toolInvocationId: string
  readonly durationMs: number
  readonly artifactReference?: string
}

export interface ToolFailedPayload {
  readonly toolInvocationId: string
  readonly durationMs: number
  readonly error: EventError
}

export interface ArtifactPersistedPayload {
  readonly artifactReference: string
  readonly artifactType: string
  readonly sizeBytes: number
}

export interface BudgetWarningPayload {
  readonly budgetType: 'cost' | 'duration' | 'attempts' | 'tool_calls'
  readonly threshold: number
  readonly observed: number
}

export interface EventPayloadMap {
  readonly [ExecutionEventType.EXECUTION_CREATED]: ExecutionCreatedPayload
  readonly [ExecutionEventType.EXECUTION_QUEUED]: ExecutionQueuedPayload
  readonly [ExecutionEventType.EXECUTION_STARTED]: ExecutionStartedPayload
  readonly [ExecutionEventType.EXECUTION_WAITING]: ExecutionWaitingPayload
  readonly [ExecutionEventType.EXECUTION_RETRY_SCHEDULED]: ExecutionRetryScheduledPayload
  readonly [ExecutionEventType.EXECUTION_SUCCEEDED]: ExecutionSucceededPayload
  readonly [ExecutionEventType.EXECUTION_FAILED]: ExecutionFailedPayload
  readonly [ExecutionEventType.EXECUTION_CANCELLED]: ExecutionCancelledPayload
  readonly [ExecutionEventType.EXECUTION_BUDGET_EXCEEDED]: ExecutionBudgetExceededPayload
  readonly [ExecutionEventType.EXECUTION_DEAD_LETTERED]: ExecutionDeadLetteredPayload
  readonly [ExecutionEventType.EXECUTION_REPLAYED]: ExecutionReplayedPayload
  readonly [ExecutionEventType.TOOL_REQUESTED]: ToolRequestedPayload
  readonly [ExecutionEventType.TOOL_STARTED]: ToolStartedPayload
  readonly [ExecutionEventType.TOOL_SUCCEEDED]: ToolSucceededPayload
  readonly [ExecutionEventType.TOOL_FAILED]: ToolFailedPayload
  readonly [ExecutionEventType.ARTIFACT_PERSISTED]: ArtifactPersistedPayload
  readonly [ExecutionEventType.BUDGET_WARNING]: BudgetWarningPayload
}

export interface ExecutionEventBase<T extends ExecutionEventType> {
  readonly eventId: string
  readonly eventType: T
  readonly executionId: string
  readonly timestamp: string
  readonly sequence: number
  readonly schemaVersion: typeof CURRENT_EVENT_SCHEMA_VERSION
  readonly correlation?: CorrelationMetadata
}

export type ExecutionEvent<T extends ExecutionEventType = ExecutionEventType> = {
  readonly [K in T]: ExecutionEventBase<K> & { readonly payload: EventPayloadMap[K] }
}[T]

export type ExecutionEventInput<T extends ExecutionEventType = ExecutionEventType> = Omit<
  ExecutionEvent<T>,
  'schemaVersion'
> & { readonly schemaVersion?: number }

export function createExecutionEvent<T extends ExecutionEventType>(
  input: ExecutionEventInput<T>,
): ExecutionEvent<T> {
  if (!isRecord(input)) {
    throw new InvalidEventError('Event must be an object')
  }
  if (!isNonEmptyString(input.eventId)) {
    throw new InvalidEventError('eventId must be a non-empty string')
  }
  if (!isEventType(input.eventType)) {
    throw new InvalidEventError('eventType must be a supported event type')
  }
  if (!isNonEmptyString(input.executionId)) {
    throw new InvalidEventError('executionId must be a non-empty string')
  }
  if (!isValidTimestamp(input.timestamp)) {
    throw new InvalidEventError('timestamp must be a valid ISO-8601 timestamp')
  }
  if (!isPositiveInteger(input.sequence)) {
    throw new InvalidEventSequenceError('sequence must be a positive integer')
  }
  const schemaVersion = input.schemaVersion ?? CURRENT_EVENT_SCHEMA_VERSION
  if (!SUPPORTED_EVENT_SCHEMA_VERSIONS.includes(schemaVersion)) {
    throw new UnsupportedEventSchemaError(schemaVersion)
  }
  validateCorrelation(input.correlation)
  validatePayload(input.eventType, input.payload)

  return Object.freeze({
    eventId: input.eventId,
    eventType: input.eventType,
    executionId: input.executionId,
    timestamp: input.timestamp,
    sequence: input.sequence,
    schemaVersion: CURRENT_EVENT_SCHEMA_VERSION,
    ...(input.correlation === undefined
      ? {}
      : { correlation: Object.freeze({ ...input.correlation }) }),
    payload: Object.freeze({ ...input.payload }),
  }) as unknown as ExecutionEvent<T>
}

function validatePayload(eventType: ExecutionEventType, payload: unknown): void {
  if (!isRecord(payload)) {
    throw new InvalidEventError(`${eventType} payload must be an object`)
  }

  switch (eventType) {
    case ExecutionEventType.EXECUTION_CREATED:
      requireStringFields(payload, ['agentId', 'provider', 'operation'])
      if (!isRecord(payload.budgetPolicy)) {
        throw new InvalidEventError('execution.created budgetPolicy must be an object')
      }
      return
    case ExecutionEventType.EXECUTION_QUEUED:
      requireStringFields(payload, ['queueName'])
      return
    case ExecutionEventType.EXECUTION_STARTED:
      requirePositiveIntegerField(payload, 'attemptNumber')
      return
    case ExecutionEventType.EXECUTION_WAITING:
      requireStringFields(payload, ['reason'])
      requireEnumField(payload, 'dependencyType', ['external', 'tool', 'async'])
      return
    case ExecutionEventType.EXECUTION_RETRY_SCHEDULED:
      requirePositiveIntegerField(payload, 'attemptNumber')
      requireStringFields(payload, ['reason', 'nextRetryAt'])
      if (payload.retryable !== true) {
        throw new InvalidEventError('execution.retry_scheduled must be retryable')
      }
      if (!isValidTimestamp(payload.nextRetryAt)) {
        throw new InvalidEventError('nextRetryAt must be a valid ISO-8601 timestamp')
      }
      return
    case ExecutionEventType.EXECUTION_SUCCEEDED:
      requirePositiveIntegerField(payload, 'attemptNumber')
      requireOptionalNonNegativeNumber(payload, 'measuredCostUsd')
      return
    case ExecutionEventType.EXECUTION_FAILED:
      requirePositiveIntegerField(payload, 'attemptNumber')
      validateEventError(payload.error)
      return
    case ExecutionEventType.EXECUTION_CANCELLED:
      requireOptionalString(payload, 'reason')
      return
    case ExecutionEventType.EXECUTION_BUDGET_EXCEEDED:
      requireEnumField(payload, 'budgetType', ['cost', 'duration', 'attempts', 'tool_calls'])
      requireNonNegativeNumberField(payload, 'limit')
      requireNonNegativeNumberField(payload, 'observed')
      return
    case ExecutionEventType.EXECUTION_DEAD_LETTERED:
      requireStringFields(payload, ['reason'])
      requirePositiveIntegerField(payload, 'attemptNumber')
      if (payload.error !== undefined) {
        validateEventError(payload.error)
      }
      return
    case ExecutionEventType.EXECUTION_REPLAYED:
      requireStringFields(payload, ['originalExecutionId', 'replayExecutionId'])
      requireEnumField(payload, 'replayMode', ['input', 'simulation'])
      if (payload.originalExecutionId === payload.replayExecutionId) {
        throw new InvalidEventError('Replay execution ids must differ')
      }
      return
    case ExecutionEventType.TOOL_REQUESTED:
    case ExecutionEventType.TOOL_STARTED:
      requireStringFields(payload, ['toolName', 'toolInvocationId'])
      requirePositiveIntegerField(payload, 'attemptNumber')
      return
    case ExecutionEventType.TOOL_SUCCEEDED:
      requireStringFields(payload, ['toolInvocationId'])
      requireNonNegativeNumberField(payload, 'durationMs')
      requireOptionalString(payload, 'artifactReference')
      return
    case ExecutionEventType.TOOL_FAILED:
      requireStringFields(payload, ['toolInvocationId'])
      requireNonNegativeNumberField(payload, 'durationMs')
      validateEventError(payload.error)
      return
    case ExecutionEventType.ARTIFACT_PERSISTED:
      requireStringFields(payload, ['artifactReference', 'artifactType'])
      requireNonNegativeNumberField(payload, 'sizeBytes')
      return
    case ExecutionEventType.BUDGET_WARNING:
      requireEnumField(payload, 'budgetType', ['cost', 'duration', 'attempts', 'tool_calls'])
      requireNonNegativeNumberField(payload, 'threshold')
      requireNonNegativeNumberField(payload, 'observed')
      return
    default:
      return assertNever(eventType)
  }
}

function validateCorrelation(correlation: unknown): void {
  if (correlation === undefined) {
    return
  }
  if (!isRecord(correlation)) {
    throw new InvalidEventError('correlation must be an object')
  }
  for (const field of ['correlationId', 'causationEventId', 'traceId', 'spanId']) {
    requireOptionalString(correlation, field)
  }
}

function validateEventError(error: unknown): void {
  if (!isRecord(error)) {
    throw new InvalidEventError('error must be a normalized error object')
  }
  requireStringFields(error, ['code', 'message'])
  if (typeof error.retryable !== 'boolean') {
    throw new InvalidEventError('error.retryable must be a boolean')
  }
}

function requireStringFields(record: Record<string, unknown>, fields: readonly string[]): void {
  for (const field of fields) {
    if (!isNonEmptyString(record[field])) {
      throw new InvalidEventError(`${field} must be a non-empty string`)
    }
  }
}

function requireOptionalString(record: Record<string, unknown>, field: string): void {
  if (record[field] !== undefined && !isNonEmptyString(record[field])) {
    throw new InvalidEventError(`${field} must be a non-empty string when provided`)
  }
}

function requirePositiveIntegerField(record: Record<string, unknown>, field: string): void {
  if (!isPositiveInteger(record[field])) {
    throw new InvalidEventSequenceError(`${field} must be a positive integer`)
  }
}

function requireNonNegativeNumberField(record: Record<string, unknown>, field: string): void {
  if (!isNonNegativeNumber(record[field])) {
    throw new InvalidEventError(`${field} must be finite and non-negative`)
  }
}

function requireOptionalNonNegativeNumber(record: Record<string, unknown>, field: string): void {
  if (record[field] !== undefined) {
    requireNonNegativeNumberField(record, field)
  }
}

function requireEnumField(
  record: Record<string, unknown>,
  field: string,
  values: readonly string[],
): void {
  if (typeof record[field] !== 'string' || !values.includes(record[field])) {
    throw new InvalidEventError(`${field} must be one of: ${values.join(', ')}`)
  }
}

function isEventType(value: unknown): value is ExecutionEventType {
  return (
    typeof value === 'string' &&
    Object.values(ExecutionEventType).includes(value as ExecutionEventType)
  )
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && value.includes('T')
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertNever(value: never): never {
  throw new Error(`Unexpected event type: ${String(value)}`)
}
