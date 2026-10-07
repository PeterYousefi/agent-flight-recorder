import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createExecution,
  createExecutionRequest,
  createNonNegativeMoney,
  ExecutionStatus,
  type ExecutionProvider,
} from '@afr/domain'
import { InMemoryMessageBus } from '@afr/adapters'
import { ExecutionOrchestrator, OutboxDispatcher, ProviderRegistry } from '@afr/application'
import { PostgresExecutionStore } from '../src/index.js'

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.AFR_TEST_DATABASE_URL ?? 'postgresql://localhost/unused' },
  },
})
const store = new PostgresExecutionStore(prisma)
const agentId = `orchestration-test-${randomUUID()}`
const request = {
  agentId,
  provider: 'fixture',
  operation: 'success',
  input: { prompt: 'test' },
  budgetPolicy: { maxCostUsd: 1, maxAttempts: 3 },
}
const provider: ExecutionProvider = {
  name: 'fixture',
  capabilities: {
    supportsCancellation: false,
    supportsCostEstimation: true,
    supportsMeasuredCost: false,
    supportsToolExecution: false,
  },
  validateRequest: () => Promise.resolve({ valid: true, errors: [] }),
  estimateCost: () => Promise.resolve(createNonNegativeMoney(0.01)),
  execute: () => Promise.resolve({ kind: 'SUCCEEDED', output: { ok: true } }),
  normalizeResult: () => ({ kind: 'SUCCEEDED', output: { ok: true } }),
  healthCheck: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
}
const orchestrator = new ExecutionOrchestrator(store, new ProviderRegistry([provider]))

describe.skipIf(process.env.AFR_TEST_DATABASE_URL === undefined)(
  'durable execution orchestration',
  () => {
    afterAll(async () => {
      const ids = (
        await prisma.execution.findMany({ where: { agentId }, select: { id: true } })
      ).map((r) => r.id)
      const where = { executionId: { in: ids } }
      await prisma.messageOutbox.deleteMany({ where })
      await prisma.auditRecord.deleteMany({ where })
      await prisma.executionEvent.deleteMany({ where })
      await prisma.execution.deleteMany({ where: { id: { in: ids } } })
      await prisma.$disconnect()
    })
    it('creates and queues an execution once under concurrent duplicate submissions', async () => {
      const idempotencyKey = randomUUID()
      const results = await Promise.all(
        Array.from({ length: 5 }, () => orchestrator.create({ ...request, idempotencyKey })),
      )
      const id = results[0]!.execution.id
      expect(new Set(results.map((r) => r.execution.id)).size).toBe(1)
      expect(results[0]?.execution.status).toBe(ExecutionStatus.QUEUED)
      expect((await store.listEvents(id)).map((e) => e.eventType)).toEqual([
        'execution.created',
        'execution.queued',
      ])
      expect(await prisma.messageOutbox.count({ where: { executionId: id } })).toBe(1)
    })
    it('recovers a crash between durable creation and scheduling', async () => {
      const initial = await store.createExecutionIdempotently(
        createExecution(randomUUID(), createExecutionRequest(request)),
      )
      expect(initial.execution.status).toBe(ExecutionStatus.PENDING)
      await orchestrator.recoverPending()
      expect((await store.getExecution(initial.execution.id))?.status).toBe(ExecutionStatus.QUEUED)
      expect(
        await prisma.messageOutbox.count({ where: { executionId: initial.execution.id } }),
      ).toBe(1)
    })
    it('retains scheduling intent after transport failure and publishes on recovery', async () => {
      const result = await orchestrator.create(request)
      const bus = new InMemoryMessageBus()
      let fail = true
      const dispatcher = new OutboxDispatcher(store, {
        publish: async (message) => {
          if (fail) throw new Error('transport unavailable')
          await bus.publish(message)
        },
        subscribe: async (handler, options) => bus.subscribe(handler, options),
      })
      await expect(dispatcher.dispatch()).rejects.toThrow('transport unavailable')
      expect(
        await prisma.messageOutbox.count({
          where: { executionId: result.execution.id, publishedAt: null },
        }),
      ).toBe(1)
      fail = false
      await dispatcher.dispatch()
      expect(
        await prisma.messageOutbox.count({
          where: { executionId: result.execution.id, publishedAt: null },
        }),
      ).toBe(0)
      const delivered: string[] = []
      await bus.subscribe((message) => {
        delivered.push(message.executionId)
        return { kind: 'ACK' }
      })
      await bus.drain()
      expect(delivered).toContain(result.execution.id)
      expect(await dispatcher.dispatch()).toBe(0)
    })
    it('persists cancellation and audit atomically and repeats it idempotently', async () => {
      const { execution } = await orchestrator.create(request)
      await orchestrator.cancel(execution.id)
      await orchestrator.cancel(execution.id)
      expect((await store.getExecution(execution.id))?.status).toBe(ExecutionStatus.CANCELLED)
      expect((await store.listEvents(execution.id)).map((e) => e.eventType)).toEqual([
        'execution.created',
        'execution.queued',
        'execution.cancelled',
      ])
      expect(
        (await store.listAuditRecords(execution.id)).filter(
          (r) => r.action === 'execution.cancelled',
        ),
      ).toHaveLength(1)
      await expect(orchestrator.queue(execution.id)).resolves.toBeUndefined()
      expect((await store.getExecution(execution.id))?.status).toBe(ExecutionStatus.CANCELLED)
    })
    it('rejects unavailable providers before creating execution records', async () => {
      const before = await prisma.execution.count({ where: { agentId } })
      await expect(orchestrator.create({ ...request, provider: 'missing' })).rejects.toMatchObject({
        code: 'PROVIDER_UNAVAILABLE',
      })
      expect(await prisma.execution.count({ where: { agentId } })).toBe(before)
    })
  },
)
