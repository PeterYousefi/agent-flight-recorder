import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createMessageEnvelope,
  ExecutionStatus,
  ReplayMode,
  ProviderFailureCategory,
  type ExecutionProvider,
  type ProviderExecutionResult,
} from '@afr/domain'
import { InMemoryArtifactStore } from '@afr/adapters'
import {
  ExecutionOrchestrator,
  ExecutionProcessor,
  ProviderRegistry,
  DeadLetterService,
  ReplayService,
} from '@afr/application'
import { PostgresExecutionStore } from '../src/index.js'
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.AFR_TEST_DATABASE_URL ?? 'postgresql://localhost/unused' },
  },
})
const store = new PostgresExecutionStore(prisma)
const agentId = `dead-letter-test-${randomUUID()}`
const provider: ExecutionProvider = {
  name: 'dead-letter-fixture',
  capabilities: {
    supportsCancellation: false,
    supportsCostEstimation: false,
    supportsMeasuredCost: false,
    supportsToolExecution: true,
  },
  validateRequest: () => Promise.resolve({ valid: true, errors: [] }),
  estimateCost: () => Promise.resolve(null),
  execute: () =>
    Promise.resolve({
      kind: 'FAILED',
      error: {
        code: 'PERMANENT',
        message: 'Permanent failure',
        retryable: false,
        category: ProviderFailureCategory.NON_RETRYABLE,
      },
    }),
  normalizeResult: (raw) => raw as unknown as ProviderExecutionResult,
  healthCheck: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
}
const registry = new ProviderRegistry([provider, { ...provider, name: 'mock' }])
const orchestrator = new ExecutionOrchestrator(store, registry)
const processor = new ExecutionProcessor(store, registry, new InMemoryArtifactStore())
const service = new DeadLetterService(store, orchestrator)
async function deadLetter(): Promise<string> {
  const { execution } = await orchestrator.create({
    agentId,
    provider: provider.name,
    operation: 'permanent',
    input: {},
    budgetPolicy: { maxAttempts: 3 },
    idempotencyKey: randomUUID(),
  })
  await processor.handle(
    createMessageEnvelope({
      messageId: randomUUID(),
      messageType: 'execution.process',
      executionId: execution.id,
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      payload: { attemptNumber: 1 },
    }),
  )
  return (await prisma.deadLetterRecord.findUniqueOrThrow({ where: { executionId: execution.id } }))
    .id
}
describe.skipIf(process.env.AFR_TEST_DATABASE_URL === undefined)(
  'immutable dead-letter workflow',
  () => {
    afterAll(async () => {
      const ids = (
        await prisma.execution.findMany({ where: { agentId }, select: { id: true } })
      ).map((r) => r.id)
      const where = { executionId: { in: ids } }
      await prisma.deadLetterRequeue.deleteMany({ where: { newExecutionId: { in: ids } } })
      await prisma.replayRelationship.deleteMany({ where: { replayExecutionId: { in: ids } } })
      await prisma.deadLetterRecord.deleteMany({ where })
      await prisma.messageOutbox.deleteMany({ where })
      await prisma.auditRecord.deleteMany({ where })
      await prisma.costRecord.deleteMany({ where })
      await prisma.executionEvent.deleteMany({ where })
      await prisma.executionAttempt.deleteMany({ where })
      await prisma.execution.deleteMany({
        where: { id: { in: ids }, originalExecutionId: { not: null } },
      })
      await prisma.execution.deleteMany({ where: { id: { in: ids } } })
      await prisma.$disconnect()
    })
    it('records terminal failure, dead-letter fact, audit and final snapshot atomically', async () => {
      const id = await deadLetter()
      const record = (await store.getDeadLetter(id))!
      expect((await store.getExecution(record.executionId))?.status).toBe(
        ExecutionStatus.DEAD_LETTERED,
      )
      expect(
        (await store.listEvents(record.executionId)).slice(-2).map((e) => e.eventType),
      ).toEqual(['execution.failed', 'execution.dead_lettered'])
      expect(
        (await store.listAuditRecords(record.executionId)).some(
          (r) => r.action === 'execution.dead_lettered',
        ),
      ).toBe(true)
      expect(await store.listCosts(record.executionId)).toHaveLength(0)
    })
    it('creates one new execution for concurrent requeue requests without changing original history', async () => {
      const id = await deadLetter()
      const record = (await store.getDeadLetter(id))!
      const original = await store.getExecution(record.executionId)
      const history = await store.listEvents(record.executionId)
      const results = await Promise.all(Array.from({ length: 6 }, () => service.requeue(id)))
      expect(new Set(results.map((r) => r.id)).size).toBe(1)
      const requeued = results[0]!
      expect(requeued.id).not.toBe(record.executionId)
      expect(requeued.status).toBe(ExecutionStatus.QUEUED)
      expect(requeued.request.idempotencyKey).toBeUndefined()
      expect(await store.getRequeuedExecutionId(id)).toBe(requeued.id)
      expect(await store.getExecution(record.executionId)).toEqual(original)
      expect(await store.listEvents(record.executionId)).toEqual(history)
      expect(await store.getDeadLetter(id)).toEqual(record)
      expect((await store.listAuditRecords(requeued.id))[0]?.action).toBe('dead_letter.requeued')
      await expect(orchestrator.cancel(record.executionId)).rejects.toThrow()
    })
    it('replays terminal input into a new execution and preserves all original records', async () => {
      const record = (await store.getDeadLetter(await deadLetter()))!
      const before = await store.getExecution(record.executionId)
      const history = await store.listEvents(record.executionId)
      const audit = await store.listAuditRecords(record.executionId)
      const replay = new ReplayService(store, registry, orchestrator)
      const input = await replay.replay(record.executionId, { mode: ReplayMode.INPUT })
      const simulation = await replay.replay(record.executionId, { mode: ReplayMode.SIMULATION })
      expect(input.request.provider).toBe(provider.name)
      expect(simulation.request.provider).toBe('mock')
      expect(simulation.request.input.scenario).toBe('success')
      expect(input.request.idempotencyKey).toBeUndefined()
      expect(input.status).toBe(ExecutionStatus.QUEUED)
      expect((await store.getReplayRelationship(input.id))?.originalExecutionId).toBe(
        record.executionId,
      )
      expect(await store.getExecution(record.executionId)).toEqual(before)
      expect(await store.listEvents(record.executionId)).toEqual(history)
      expect(await store.listAuditRecords(record.executionId)).toEqual(audit)
      await expect(replay.replay(input.id, { mode: ReplayMode.INPUT })).rejects.toMatchObject({
        code: 'CONFLICT',
      })
    })
    it('rejects nonexistent dead letters', async () => {
      await expect(service.requeue(randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  },
)
