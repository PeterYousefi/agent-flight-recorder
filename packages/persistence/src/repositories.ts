import {
  createExecutionEvent,
  createExecutionAttempt,
  createExecutionRequest,
  transition,
  validateExecutionEventStream,
  ReplayMode,
  type Execution,
  type ExecutionStatus,
  type ExecutionEvent,
  type ExecutionAttempt,
  type ExecutionQuery,
  type CostRecord,
  type StoredArtifact,
  type ReplayRelationship,
  type DeadLetterRecord,
  type AuditRecord,
  type OutboxRecord,
  createMessageEnvelope,
  type MessageEnvelope,
  type ExecutionRepositories,
  type ExecutionStore,
} from '@afr/domain'
import { Prisma, type PrismaClient } from '@prisma/client'
import { executionFromRow, attemptFromRow, eventFromRow, json } from './mapping.js'
import { PersistenceError } from './errors.js'
import { createIdempotently } from './idempotency.js'

function pagination(query: ExecutionQuery = {}): { take: number; skip: number } {
  const take = query.limit ?? 50
  const skip = query.offset ?? 0
  if (!Number.isInteger(take) || take < 1 || take > 100 || !Number.isInteger(skip) || skip < 0) {
    throw new PersistenceError('INVALID_RECORD', 'Invalid pagination')
  }
  return { take, skip }
}

class RepositorySession implements ExecutionRepositories {
  public constructor(protected readonly db: Prisma.TransactionClient) {}

  public async createOutbox(record: OutboxRecord): Promise<void> {
    const message = createMessageEnvelope(record.message)
    if (message.messageId !== record.id || message.executionId !== record.executionId)
      throw new PersistenceError('INVALID_RECORD', 'Outbox metadata does not match envelope')
    await this.db.messageOutbox.create({ data: { ...record, message: json(message) } })
  }
  public async listPendingOutbox(now: Date, limit = 50): Promise<readonly OutboxRecord[]> {
    return (
      await this.db.messageOutbox.findMany({
        where: { publishedAt: null, availableAt: { lte: now } },
        ...pagination({ limit }),
        orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
      })
    ).map((row) => ({
      id: row.id,
      executionId: row.executionId,
      availableAt: row.availableAt,
      message: createMessageEnvelope(row.message as unknown as MessageEnvelope),
    }))
  }
  public async markOutboxPublished(id: string, now: Date): Promise<void> {
    await this.db.messageOutbox.updateMany({
      where: { id, publishedAt: null },
      data: { publishedAt: now },
    })
  }
  public async createExecution(execution: Execution): Promise<Execution> {
    const request = createExecutionRequest(execution.request)
    const row = await this.db.execution.create({
      data: {
        id: execution.id,
        agentId: request.agentId,
        provider: request.provider,
        operation: request.operation,
        input: json(request.input),
        status: execution.status,
        budgetPolicy: json(request.budgetPolicy),
        createdAt: execution.createdAt,
        updatedAt: execution.updatedAt,
        ...(request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey }),
        ...(request.metadata === undefined ? {} : { metadata: json(request.metadata) }),
        ...(execution.originalExecutionId === undefined
          ? {}
          : { originalExecutionId: execution.originalExecutionId }),
      },
    })
    return executionFromRow(row)
  }
  public async getExecution(id: string): Promise<Execution | undefined> {
    const row = await this.db.execution.findUnique({ where: { id } })
    if (row === null) return undefined
    const execution = executionFromRow(row)
    const replay = await this.getReplayRelationship(id)
    return replay === undefined
      ? execution
      : Object.freeze({ ...execution, replayMode: replay.replayMode })
  }
  public async listExecutions(query: ExecutionQuery = {}): Promise<readonly Execution[]> {
    const rows = await this.db.execution.findMany({
      ...pagination(query),
      ...(query.status === undefined ? {} : { where: { status: query.status } }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    return rows.map(executionFromRow)
  }
  public async updateExecutionSnapshot(
    id: string,
    expectedStatus: ExecutionStatus,
    status: ExecutionStatus,
    now: Date,
  ): Promise<Execution> {
    transition(expectedStatus, status)
    const result = await this.db.execution.updateMany({
      where: { id, status: expectedStatus },
      data: { status, updatedAt: now },
    })
    if (result.count !== 1)
      throw new PersistenceError('CONFLICT', 'Execution status changed or execution is missing')
    const resultExecution = await this.getExecution(id)
    if (resultExecution === undefined)
      throw new PersistenceError('NOT_FOUND', 'Execution is missing')
    return resultExecution
  }
  public async appendEvent(event: ExecutionEvent): Promise<void> {
    const validated = createExecutionEvent(event)
    const history = await this.listEvents(validated.executionId)
    validateExecutionEventStream([...history, validated])
    await this.db.executionEvent.create({
      data: {
        id: validated.eventId,
        executionId: validated.executionId,
        eventType: validated.eventType,
        sequence: validated.sequence,
        schemaVersion: validated.schemaVersion,
        timestamp: new Date(validated.timestamp),
        payload: json(validated.payload),
        ...validated.correlation,
      },
    })
  }
  public async listEvents(executionId: string): Promise<readonly ExecutionEvent[]> {
    const rows = await this.db.executionEvent.findMany({
      where: { executionId },
      orderBy: { sequence: 'asc' },
    })
    return rows.map(eventFromRow)
  }
  public async createAttempt(attempt: ExecutionAttempt): Promise<void> {
    await this.db.executionAttempt.create({ data: createExecutionAttempt(attempt) })
  }
  public async finishAttempt(attempt: ExecutionAttempt): Promise<void> {
    const validated = createExecutionAttempt(attempt)
    if (validated.status === 'RUNNING' || validated.completedAt === undefined)
      throw new PersistenceError(
        'INVALID_RECORD',
        'Finished attempts require a final status and completion time',
      )
    const result = await this.db.executionAttempt.updateMany({
      where: {
        id: validated.id,
        executionId: validated.executionId,
        attemptNumber: validated.attemptNumber,
        status: 'RUNNING',
      },
      data: {
        status: validated.status,
        completedAt: validated.completedAt,
        ...(validated.errorCode === undefined ? {} : { errorCode: validated.errorCode }),
        ...(validated.errorMessage === undefined ? {} : { errorMessage: validated.errorMessage }),
        ...(validated.retryable === undefined ? {} : { retryable: validated.retryable }),
      },
    })
    if (result.count !== 1)
      throw new PersistenceError('CONFLICT', 'Attempt is missing or already finished')
  }
  public async listAttempts(executionId: string): Promise<readonly ExecutionAttempt[]> {
    return (
      await this.db.executionAttempt.findMany({
        where: { executionId },
        orderBy: { attemptNumber: 'asc' },
      })
    ).map(attemptFromRow)
  }
  public async recordCost(cost: CostRecord): Promise<void> {
    if (cost.amountMicroUsd < 0n)
      throw new PersistenceError('INVALID_RECORD', 'Cost cannot be negative')
    if (cost.attemptId !== undefined) {
      const attempt = await this.db.executionAttempt.findFirst({
        where: { id: cost.attemptId, executionId: cost.executionId },
      })
      if (attempt === null)
        throw new PersistenceError(
          'INVALID_RECORD',
          'Cost attempt belongs to another execution or is missing',
        )
    }
    await this.db.costRecord.create({ data: cost })
  }
  public async listCosts(executionId: string): Promise<readonly CostRecord[]> {
    return (
      await this.db.costRecord.findMany({
        where: { executionId },
        orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
      })
    ).map((row) => {
      if (row.kind !== 'estimated' && row.kind !== 'measured')
        throw new PersistenceError('INVALID_RECORD', 'Unknown cost kind')
      return {
        id: row.id,
        executionId: row.executionId,
        category: row.category,
        kind: row.kind,
        amountMicroUsd: row.amountMicroUsd,
        timestamp: row.timestamp,
        ...(row.attemptId === null ? {} : { attemptId: row.attemptId }),
      }
    })
  }
  public async recordArtifact(artifact: StoredArtifact): Promise<void> {
    if (artifact.sizeBytes < 0n)
      throw new PersistenceError('INVALID_RECORD', 'Artifact size cannot be negative')
    await this.db.artifact.create({ data: artifact })
  }
  public async listArtifacts(executionId: string): Promise<readonly StoredArtifact[]> {
    return (
      await this.db.artifact.findMany({
        where: { executionId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
    ).map((row) => ({
      id: row.id,
      executionId: row.executionId,
      kind: row.kind,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      storageKey: row.storageKey,
      createdAt: row.createdAt,
      ...(row.checksum === null ? {} : { checksum: row.checksum }),
    }))
  }
  public async createReplayRelationship(relationship: ReplayRelationship): Promise<void> {
    if (
      relationship.originalExecutionId === relationship.replayExecutionId ||
      !Object.values(ReplayMode).includes(relationship.replayMode)
    )
      throw new PersistenceError('INVALID_RECORD', 'Invalid replay relationship')
    await this.db.replayRelationship.create({ data: relationship })
  }
  public async getReplayRelationship(
    replayExecutionId: string,
  ): Promise<ReplayRelationship | undefined> {
    const row = await this.db.replayRelationship.findUnique({ where: { replayExecutionId } })
    if (row === null) return undefined
    if (!Object.values(ReplayMode).includes(row.replayMode as ReplayMode))
      throw new PersistenceError('INVALID_RECORD', 'Unknown replay mode')
    return { ...row, replayMode: row.replayMode as ReplayMode }
  }
  public async createDeadLetter(record: DeadLetterRecord): Promise<void> {
    await this.db.deadLetterRecord.create({ data: record })
  }
  public async listDeadLetters(query: ExecutionQuery = {}): Promise<readonly DeadLetterRecord[]> {
    return (
      await this.db.deadLetterRecord.findMany({
        ...pagination(query),
        orderBy: [{ deadLetteredAt: 'desc' }, { id: 'desc' }],
      })
    ).map((row) => ({
      id: row.id,
      executionId: row.executionId,
      finalAttempt: row.finalAttempt,
      reason: row.reason,
      deadLetteredAt: row.deadLetteredAt,
      ...(row.requeuedAsExecutionId === null
        ? {}
        : { requeuedAsExecutionId: row.requeuedAsExecutionId }),
    }))
  }
  public async createAuditRecord(record: AuditRecord): Promise<void> {
    await this.db.auditRecord.create({
      data: {
        ...record,
        ...(record.metadata === undefined ? {} : { metadata: json(record.metadata) }),
      },
    })
  }
  public async listAuditRecords(executionId: string): Promise<readonly AuditRecord[]> {
    return (
      await this.db.auditRecord.findMany({
        where: { executionId },
        orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
      })
    ).map((row) => ({
      id: row.id,
      action: row.action,
      timestamp: row.timestamp,
      ...(row.executionId === null ? {} : { executionId: row.executionId }),
      ...(row.actorId === null ? {} : { actorId: row.actorId }),
      ...(row.metadata === null
        ? {}
        : { metadata: row.metadata as AuditRecord['metadata'] & object }),
    }))
  }
}

export class PostgresExecutionStore extends RepositorySession implements ExecutionStore {
  public constructor(private readonly client: PrismaClient) {
    super(client)
  }
  public async createExecutionIdempotently(
    execution: Execution,
  ): Promise<{ execution: Execution; created: boolean }> {
    return createIdempotently(this.client, execution, (db) => new RepositorySession(db))
  }
  public async transaction<T>(
    executionId: string,
    work: (repositories: ExecutionRepositories) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.client.$transaction(
        async (db) => {
          const locked = await db.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM executions WHERE id = ${executionId}::uuid FOR UPDATE`
          if (locked.length !== 1) throw new PersistenceError('NOT_FOUND', 'Execution is missing')
          return work(new RepositorySession(db))
        },
        { maxWait: 10000, timeout: 10000 },
      )
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new PersistenceError('CONFLICT', 'Record uniqueness conflict')
      throw error
    }
  }
  public override async appendEvent(event: ExecutionEvent): Promise<void> {
    await this.transaction(event.executionId, (repositories) => repositories.appendEvent(event))
  }
}
