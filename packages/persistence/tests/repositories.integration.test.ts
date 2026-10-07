import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createExecution,
  createExecutionRequest,
  createExecutionEvent,
  createExecutionAttempt,
  ExecutionStatus,
  ExecutionEventType,
  AttemptStatus,
  ReplayMode,
  type ExecutionEvent,
} from '@afr/domain'
import { PostgresExecutionStore } from '../src/index.js'

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.AFR_TEST_DATABASE_URL ?? 'postgresql://localhost/unused' },
  },
})
const store = new PostgresExecutionStore(prisma)
const ids: string[] = []
const now = new Date('2026-10-07T17:00:00Z')
const request = createExecutionRequest({
  agentId: 'test',
  provider: 'mock',
  operation: 'success',
  input: { message: 'hello' },
  budgetPolicy: { maxCostUsd: 1, maxAttempts: 3, maxDurationMs: 10000, maxToolCalls: 10 },
})
async function setup(): Promise<string> {
  const execution = createExecution(randomUUID(), request, now)
  await store.createExecution(execution)
  ids.push(execution.id)
  await store.appendEvent(created(execution.id))
  return execution.id
}
function created(id: string): ExecutionEvent {
  return createExecutionEvent({
    eventId: randomUUID(),
    executionId: id,
    eventType: ExecutionEventType.EXECUTION_CREATED,
    sequence: 1,
    timestamp: now.toISOString(),
    payload: {
      agentId: request.agentId,
      provider: request.provider,
      operation: request.operation,
      budgetPolicy: request.budgetPolicy,
    },
  })
}
function queued(id: string, sequence = 2): ExecutionEvent {
  return createExecutionEvent({
    eventId: randomUUID(),
    executionId: id,
    eventType: ExecutionEventType.EXECUTION_QUEUED,
    sequence,
    timestamp: now.toISOString(),
    payload: { queueName: 'executions' },
    correlation: { traceId: 'test-trace' },
  })
}

describe.skipIf(process.env.AFR_TEST_DATABASE_URL === undefined)('PostgreSQL repositories', () => {
  afterAll(async () => {
    const where = { executionId: { in: ids } }
    await prisma.auditRecord.deleteMany({ where })
    await prisma.deadLetterRecord.deleteMany({ where })
    await prisma.replayRelationship.deleteMany({ where: { originalExecutionId: { in: ids } } })
    await prisma.artifact.deleteMany({ where })
    await prisma.costRecord.deleteMany({ where })
    await prisma.executionEvent.deleteMany({ where })
    await prisma.executionAttempt.deleteMany({ where })
    await prisma.execution.deleteMany({
      where: { id: { in: ids }, originalExecutionId: { not: null } },
    })
    await prisma.execution.deleteMany({ where: { id: { in: ids } } })
    await prisma.$disconnect()
  })
  it('round trips normalized requests and paginates snapshots', async () => {
    const id = await setup()
    expect((await store.getExecution(id))?.request).toEqual(request)
    expect(await store.getExecution(randomUUID())).toBeUndefined()
    expect(await store.listExecutions({ limit: 1, status: ExecutionStatus.PENDING })).toHaveLength(
      1,
    )
    await expect(store.listExecutions({ limit: 0 })).rejects.toThrow('Invalid pagination')
  })
  it('commits snapshot and ordered correlated event atomically', async () => {
    const id = await setup()
    await store.transaction(id, async (tx) => {
      await tx.appendEvent(queued(id))
      await tx.updateExecutionSnapshot(id, ExecutionStatus.PENDING, ExecutionStatus.QUEUED, now)
    })
    expect((await store.getExecution(id))?.status).toBe(ExecutionStatus.QUEUED)
    const events = await store.listEvents(id)
    expect(events.map((e) => e.sequence)).toEqual([1, 2])
    expect(events[1]?.correlation?.traceId).toBe('test-trace')
  })
  it('rolls back all writes on a callback failure', async () => {
    const id = await setup()
    await expect(
      store.transaction(id, async (tx) => {
        await tx.appendEvent(queued(id))
        await tx.updateExecutionSnapshot(id, ExecutionStatus.PENDING, ExecutionStatus.QUEUED, now)
        throw new Error('injected crash')
      }),
    ).rejects.toThrow('injected crash')
    expect(await store.listEvents(id)).toHaveLength(1)
    expect((await store.getExecution(id))?.status).toBe(ExecutionStatus.PENDING)
  })
  it('serializes concurrent event appends and rejects duplicate or gapped sequences', async () => {
    const id = await setup()
    const results = await Promise.allSettled([
      store.appendEvent(queued(id)),
      store.appendEvent(queued(id)),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await store.listEvents(id)).toHaveLength(2)
    await expect(store.appendEvent(queued(id, 4))).rejects.toThrow('Expected sequence 3')
  })
  it('rejects stale snapshot writes and invalid lifecycle transitions', async () => {
    const id = await setup()
    await store.updateExecutionSnapshot(id, ExecutionStatus.PENDING, ExecutionStatus.QUEUED, now)
    await expect(
      store.updateExecutionSnapshot(id, ExecutionStatus.PENDING, ExecutionStatus.QUEUED, now),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      store.updateExecutionSnapshot(id, ExecutionStatus.QUEUED, ExecutionStatus.SUCCEEDED, now),
    ).rejects.toThrow('Invalid execution state transition')
  })
  it('finishes attempts once, records exact costs, rejects cross-execution cost attribution', async () => {
    const id = await setup()
    const otherId = await setup()
    const attempt = createExecutionAttempt({
      id: randomUUID(),
      executionId: id,
      attemptNumber: 1,
      status: AttemptStatus.RUNNING,
      startedAt: now,
    })
    await store.createAttempt(attempt)
    const finished = { ...attempt, status: AttemptStatus.SUCCEEDED, completedAt: now }
    await store.finishAttempt(finished)
    await expect(store.finishAttempt(finished)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect((await store.listAttempts(id))[0]?.status).toBe(AttemptStatus.SUCCEEDED)
    const cost = {
      id: randomUUID(),
      executionId: id,
      attemptId: attempt.id,
      category: 'provider',
      kind: 'measured' as const,
      amountMicroUsd: 9007199254740993n,
      timestamp: now,
    }
    await store.recordCost(cost)
    expect((await store.listCosts(id))[0]?.amountMicroUsd).toBe(cost.amountMicroUsd)
    await expect(
      store.recordCost({ ...cost, id: randomUUID(), executionId: otherId }),
    ).rejects.toMatchObject({ code: 'INVALID_RECORD' })
  })
  it('persists artifacts, replay relationships, dead letters and audits without mutating originals', async () => {
    const id = await setup()
    const original = await store.getExecution(id)
    const events = await store.listEvents(id)
    const replay = createExecution(randomUUID(), request, now, {
      originalExecutionId: id,
      replayMode: ReplayMode.SIMULATION,
    })
    await store.createExecution(replay)
    ids.push(replay.id)
    await store.createReplayRelationship({
      id: randomUUID(),
      originalExecutionId: id,
      replayExecutionId: replay.id,
      replayMode: ReplayMode.SIMULATION,
      createdAt: now,
    })
    expect((await store.getExecution(replay.id))?.replayMode).toBe(ReplayMode.SIMULATION)
    await store.recordArtifact({
      id: randomUUID(),
      executionId: id,
      kind: 'output',
      contentType: 'application/json',
      sizeBytes: 2n,
      checksum: 'checksum',
      storageKey: randomUUID(),
      createdAt: now,
    })
    await store.createDeadLetter({
      id: randomUUID(),
      executionId: id,
      reason: 'exhausted',
      finalAttempt: 3,
      deadLetteredAt: now,
    })
    await store.createAuditRecord({
      id: randomUUID(),
      executionId: id,
      action: 'replay.created',
      timestamp: now,
      metadata: { replayExecutionId: replay.id },
    })
    expect(await store.listArtifacts(id)).toHaveLength(1)
    expect((await store.listDeadLetters()).some((r) => r.executionId === id)).toBe(true)
    expect(await store.listAuditRecords(id)).toHaveLength(1)
    expect(await store.getExecution(id)).toEqual(original)
    expect(await store.listEvents(id)).toEqual(events)
  })
})
