import {
  createExecutionRequest,
  createExecutionAttempt,
  createExecutionEvent,
  ExecutionStatus,
  isJsonValue,
  type Execution,
  type ExecutionAttempt,
  type ExecutionEvent,
  type ExecutionEventInput,
} from '@afr/domain'
import type {
  Execution as ExecutionRow,
  ExecutionAttempt as AttemptRow,
  ExecutionEvent as EventRow,
  Prisma,
} from '@prisma/client'
import { PersistenceError } from './errors.js'

export function json(value: unknown): Prisma.InputJsonValue {
  if (!isJsonValue(value) || value === null)
    throw new PersistenceError('INVALID_RECORD', 'Expected a JSON object or value')
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}
export function executionFromRow(row: ExecutionRow): Execution {
  if (!Object.values(ExecutionStatus).includes(row.status as ExecutionStatus))
    throw new PersistenceError('INVALID_RECORD', 'Unknown execution status')
  return Object.freeze({
    id: row.id,
    status: row.status as ExecutionStatus,
    request: createExecutionRequest({
      agentId: row.agentId,
      provider: row.provider,
      operation: row.operation,
      input: row.input,
      budgetPolicy: row.budgetPolicy,
      ...(row.idempotencyKey === null ? {} : { idempotencyKey: row.idempotencyKey }),
      ...(row.metadata === null ? {} : { metadata: row.metadata }),
    }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.originalExecutionId === null ? {} : { originalExecutionId: row.originalExecutionId }),
  })
}
export function attemptFromRow(row: AttemptRow): ExecutionAttempt {
  return createExecutionAttempt({
    ...row,
    completedAt: row.completedAt ?? undefined,
    errorCode: row.errorCode ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    retryable: row.retryable ?? undefined,
  })
}
export function eventFromRow(row: EventRow): ExecutionEvent {
  return createExecutionEvent({
    eventId: row.id,
    executionId: row.executionId,
    eventType: row.eventType,
    sequence: row.sequence,
    schemaVersion: row.schemaVersion,
    timestamp: row.timestamp.toISOString(),
    payload: row.payload,
    correlation: {
      ...(row.correlationId === null ? {} : { correlationId: row.correlationId }),
      ...(row.causationEventId === null ? {} : { causationEventId: row.causationEventId }),
      ...(row.traceId === null ? {} : { traceId: row.traceId }),
      ...(row.spanId === null ? {} : { spanId: row.spanId }),
    },
  } as ExecutionEventInput)
}
