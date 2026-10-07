import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createMessageEnvelope,
  createExecutionAttempt,
  createExecutionEvent,
  ExecutionEventType,
  AttemptStatus,
  createNonNegativeMoney,
  ExecutionStatus,
  type ExecutionProvider,
  type ProviderExecutionResult,
  type JsonValue,
} from '@afr/domain'
import { InMemoryMessageBus, InMemoryArtifactStore } from '@afr/adapters'
import {
  ExecutionOrchestrator,
  ExecutionProcessor,
  OutboxDispatcher,
  ProviderRegistry,
} from '@afr/application'
import { PostgresExecutionStore } from '../src/index.js'

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.AFR_TEST_DATABASE_URL ?? 'postgresql://localhost/unused' },
  },
})
const store = new PostgresExecutionStore(prisma)
const agentId = `processor-test-${randomUUID()}`
let now = new Date()
let calls = 0
let execute: () => Promise<ProviderExecutionResult> = () =>
  Promise.resolve({
    kind: 'SUCCEEDED',
    output: { answer: 42 },
    cost: { measured: createNonNegativeMoney(0.01) },
  })
const provider: ExecutionProvider = {
  name: 'processor-fixture',
  capabilities: {
    supportsCancellation: false,
    supportsCostEstimation: true,
    supportsMeasuredCost: true,
    supportsToolExecution: true,
  },
  validateRequest: () => Promise.resolve({ valid: true, errors: [] }),
  estimateCost: () => Promise.resolve(createNonNegativeMoney(0.01)),
  execute: async () => {
    calls++
    return execute()
  },
  normalizeResult: (raw: JsonValue) => raw as unknown as ProviderExecutionResult,
  healthCheck: () => Promise.resolve({ status: 'healthy', checkedAt: now.toISOString() }),
}
const runtime = { now: () => now, id: randomUUID }
const registry = new ProviderRegistry([provider])
const artifacts = new InMemoryArtifactStore()
const orchestrator = new ExecutionOrchestrator(store, registry, runtime)
const processor = new ExecutionProcessor(store, registry, artifacts, runtime, 1000)
async function create(maxCostUsd = 1): Promise<string> {
  return (
    await orchestrator.create({
      agentId,
      provider: provider.name,
      operation: 'success',
      input: { message: 'test' },
      budgetPolicy: { maxCostUsd, maxAttempts: 3, maxDurationSeconds: 60, maxToolCalls: 10 },
    })
  ).execution.id
}
function message(id: string, attemptNumber = 1): ReturnType<typeof createMessageEnvelope> {
  return createMessageEnvelope({
    messageId: randomUUID(),
    messageType: 'execution.process',
    executionId: id,
    schemaVersion: 1,
    createdAt: now.toISOString(),
    payload: { attemptNumber },
  })
}
describe.skipIf(process.env.AFR_TEST_DATABASE_URL === undefined)(
  'asynchronous execution processor',
  () => {
    afterAll(async () => {
      const ids = (
        await prisma.execution.findMany({ where: { agentId }, select: { id: true } })
      ).map((r) => r.id)
      const where = { executionId: { in: ids } }
      await prisma.messageOutbox.deleteMany({ where })
      await prisma.deadLetterRecord.deleteMany({ where })
      await prisma.auditRecord.deleteMany({ where })
      await prisma.artifact.deleteMany({ where })
      await prisma.costRecord.deleteMany({ where })
      await prisma.executionEvent.deleteMany({ where })
      await prisma.executionAttempt.deleteMany({ where })
      await prisma.execution.deleteMany({ where: { id: { in: ids } } })
      await prisma.$disconnect()
    })
    it('processes API scheduling through a queue into durable events, attempts, costs and artifacts', async () => {
      const id = await create()
      const bus = new InMemoryMessageBus()
      await bus.subscribe((m) => processor.handle(m))
      await new OutboxDispatcher(store, bus, runtime).dispatch()
      await bus.drain()
      expect((await store.getExecution(id))?.status).toBe(ExecutionStatus.SUCCEEDED)
      expect((await store.listAttempts(id))[0]?.status).toBe('SUCCEEDED')
      expect((await store.listCosts(id)).map((c) => c.kind).sort()).toEqual([
        'estimated',
        'measured',
      ])
      const artifact = (await store.listArtifacts(id))[0]!
      expect(
        (await artifacts.get({ artifactId: artifact.id, executionId: id, kind: 'provider_output' }))
          .content,
      ).toEqual({ answer: 42 })
      expect((await store.listEvents(id)).map((e) => e.eventType)).toEqual([
        'execution.created',
        'execution.queued',
        'execution.started',
        'tool.requested',
        'tool.started',
        'artifact.persisted',
        'tool.succeeded',
        'execution.succeeded',
      ])
    })
    it('fences duplicate delivery and invokes the provider once', async () => {
      const id = await create()
      const before = calls
      const results = await Promise.all([
        processor.handle(message(id)),
        processor.handle(message(id)),
        processor.handle(message(id)),
      ])
      expect(calls - before).toBe(1)
      expect(results.some((r) => r.kind === 'ACK')).toBe(true)
      expect(await processor.handle(message(id))).toEqual({ kind: 'ACK' })
      expect(await store.listAttempts(id)).toHaveLength(1)
    })
    it('rejects estimated budget overruns before a provider call and emits warnings at 80 percent', async () => {
      const id = await create(0.005)
      const before = calls
      await processor.handle(message(id))
      expect(calls).toBe(before)
      expect((await store.getExecution(id))?.status).toBe(ExecutionStatus.BUDGET_EXCEEDED)
      const warningId = await create(0.012)
      await processor.handle(message(warningId))
      expect(
        (await store.listEvents(warningId)).some(
          (e) => e.eventType === 'budget.warning' && e.payload.budgetType === 'cost',
        ),
      ).toBe(true)
    })
    it('retains measured charges when cancellation wins a race with success', async () => {
      const id = await create()
      let release: (result: ProviderExecutionResult) => void = () => {}
      let entered: () => void = () => {}
      const barrier = new Promise<void>((resolve) => {
        entered = resolve
      })
      execute = () => {
        entered()
        return new Promise((resolve) => {
          release = resolve
        })
      }
      const handling = processor.handle(message(id))
      await barrier
      await orchestrator.cancel(id)
      release({
        kind: 'SUCCEEDED',
        output: { late: true },
        cost: { measured: createNonNegativeMoney(0.02) },
      })
      await handling
      execute = () =>
        Promise.resolve({
          kind: 'SUCCEEDED',
          output: { answer: 42 },
          cost: { measured: createNonNegativeMoney(0.01) },
        })
      expect((await store.getExecution(id))?.status).toBe(ExecutionStatus.CANCELLED)
      expect((await store.listAttempts(id))[0]?.status).toBe('CANCELLED')
      expect((await store.listEvents(id)).at(-1)?.eventType).toBe('execution.cancelled')
      expect((await store.listCosts(id)).find((c) => c.kind === 'measured')?.amountMicroUsd).toBe(
        20000n,
      )
      expect(await store.listArtifacts(id)).toHaveLength(0)
    })
    it('normalizes thrown provider failures without persisting exception contents', async () => {
      const id = await create()
      execute = () => Promise.reject(new Error('sensitive provider exception'))
      await processor.handle(message(id))
      execute = () => Promise.resolve({ kind: 'SUCCEEDED', output: { answer: 42 } })
      expect((await store.getExecution(id))?.status).toBe(ExecutionStatus.DEAD_LETTERED)
      expect(JSON.stringify(await store.listEvents(id))).not.toContain(
        'sensitive provider exception',
      )
    })
    it('recovers an expired worker claim while preserving attempt history', async () => {
      const id = await create()
      await store.transaction(id, async (tx) => {
        await tx.createAttempt(
          createExecutionAttempt({
            id: randomUUID(),
            executionId: id,
            attemptNumber: 1,
            status: AttemptStatus.RUNNING,
            startedAt: now,
            leaseExpiresAt: new Date(now.getTime() + 1000),
          }),
        )
        await tx.appendEvent(
          createExecutionEvent({
            eventId: randomUUID(),
            executionId: id,
            eventType: ExecutionEventType.EXECUTION_STARTED,
            sequence: 3,
            timestamp: now.toISOString(),
            payload: { attemptNumber: 1 },
          }),
        )
        await tx.updateExecutionSnapshot(id, ExecutionStatus.QUEUED, ExecutionStatus.RUNNING, now)
      })
      expect((await processor.handle(message(id))).kind).toBe('RETRY')
      now = new Date(now.getTime() + 1001)
      await processor.handle(message(id))
      expect((await store.getExecution(id))?.status).toBe(ExecutionStatus.RETRY_SCHEDULED)
      now = new Date(now.getTime() + 31000)
      const recoveryBus = new InMemoryMessageBus()
      await recoveryBus.subscribe((m) => processor.handle(m))
      await new OutboxDispatcher(store, recoveryBus, runtime).dispatch()
      await recoveryBus.drain()
      const attempts = await store.listAttempts(id)
      expect(attempts.map((a) => a.status)).toEqual(['FAILED', 'SUCCEEDED'])
      expect(attempts[0]?.errorCode).toBe('WORKER_LEASE_EXPIRED')
      expect(
        (await store.listEvents(id)).some((e) => e.eventType === 'execution.retry_scheduled'),
      ).toBe(true)
    })
    it('records measured budget overruns as budget exceeded after execution', async () => {
      const id = await create(0.015)
      execute = () =>
        Promise.resolve({
          kind: 'SUCCEEDED',
          output: { answer: 42 },
          cost: { measured: createNonNegativeMoney(0.02) },
        })
      await processor.handle(message(id))
      execute = () => Promise.resolve({ kind: 'SUCCEEDED', output: { answer: 42 } })
      expect((await store.getExecution(id))?.status).toBe(ExecutionStatus.BUDGET_EXCEEDED)
      expect((await store.listCosts(id)).find((c) => c.kind === 'measured')?.amountMicroUsd).toBe(
        20000n,
      )
    })
    it('rejects unsupported messages without touching execution history', async () => {
      const id = await create()
      expect((await processor.handle({ ...message(id), schemaVersion: 2 })).kind).toBe(
        'DEAD_LETTER',
      )
      expect((await store.getExecution(id))?.status).toBe(ExecutionStatus.QUEUED)
    })
  },
)
