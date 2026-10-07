import { createHash, randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import {
  createExecutionRequest,
  createExecutionEvent,
  ExecutionEventType,
  type Execution,
  type ExecutionRepositories,
} from '@afr/domain'
import { PersistenceError } from './errors.js'
import { executionFromRow } from './mapping.js'

export function requestFingerprint(execution: Execution): string {
  const { idempotencyKey: _key, ...request } = createExecutionRequest(execution.request)
  return createHash('sha256').update(canonicalJson(request)).digest('hex')
}
function canonicalJson(value: unknown, ancestors = new Set<object>()): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return JSON.stringify(value)
  if (
    typeof value !== 'object' ||
    ancestors.has(value) ||
    (!Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new PersistenceError(
      'INVALID_RECORD',
      'Execution request must contain acyclic plain JSON values',
    )
  }
  ancestors.add(value)
  try {
    if (Array.isArray(value))
      return `[${Array.from(value, (item) => canonicalJson(item, ancestors)).join(',')}]`
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key], ancestors)}`)
      .join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}
export async function createIdempotently(
  client: PrismaClient,
  execution: Execution,
  session: (db: Prisma.TransactionClient) => ExecutionRepositories,
): Promise<{ execution: Execution; created: boolean }> {
  const key = execution.request.idempotencyKey
  if (key !== undefined && !/^[A-Za-z0-9._:-]{1,128}$/.test(key)) {
    throw new PersistenceError(
      'INVALID_RECORD',
      'Idempotency key must be 1–128 ASCII letters, digits, dots, underscores, colons or hyphens',
    )
  }
  const fingerprint = requestFingerprint(execution)
  try {
    const stored = await client.$transaction(async (db) => {
      const repositories = session(db)
      const result = await repositories.createExecution(execution)
      await db.execution.update({
        where: { id: result.id },
        data: { requestFingerprint: fingerprint },
      })
      await repositories.appendEvent(
        createExecutionEvent({
          eventId: randomUUID(),
          executionId: result.id,
          eventType: ExecutionEventType.EXECUTION_CREATED,
          sequence: 1,
          timestamp: result.createdAt.toISOString(),
          payload: {
            agentId: result.request.agentId,
            provider: result.request.provider,
            operation: result.request.operation,
            budgetPolicy: result.request.budgetPolicy,
          },
        }),
      )
      await repositories.createAuditRecord({
        id: randomUUID(),
        executionId: result.id,
        action: 'execution.created',
        timestamp: result.createdAt,
      })
      return result
    })
    return { execution: stored, created: true }
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002' ||
      key === undefined
    )
      throw error
    const existing = await client.execution.findUnique({ where: { idempotencyKey: key } })
    // A primary-key collision is not an idempotency hit.
    if (existing === null)
      throw new PersistenceError('CONFLICT', 'Execution record uniqueness conflict')
    if (existing.requestFingerprint !== fingerprint)
      throw new PersistenceError(
        'CONFLICT',
        'Idempotency key was already used for a different request',
      )
    return { execution: executionFromRow(existing), created: false }
  }
}
