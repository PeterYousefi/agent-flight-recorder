import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import { createExecution, createExecutionRequest } from '@afr/domain'
import { PostgresExecutionStore } from '../src/index.js'

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.AFR_TEST_DATABASE_URL ?? 'postgresql://localhost/unused' },
  },
})
const store = new PostgresExecutionStore(prisma)
const agentId = `idempotency-test-${randomUUID()}`
function execution(
  key?: string,
  input: Record<string, unknown> = { message: 'hello' },
): ReturnType<typeof createExecution> {
  return createExecution(
    randomUUID(),
    createExecutionRequest({
      agentId,
      provider: 'mock',
      operation: 'success',
      input,
      budgetPolicy: { maxCostUsd: 1, maxAttempts: 3 },
      ...(key === undefined ? {} : { idempotencyKey: key }),
    }),
  )
}
describe.skipIf(process.env.AFR_TEST_DATABASE_URL === undefined)(
  'durable idempotent creation',
  () => {
    afterAll(async () => {
      const ids = (
        await prisma.execution.findMany({ where: { agentId }, select: { id: true } })
      ).map((row) => row.id)
      await prisma.auditRecord.deleteMany({ where: { executionId: { in: ids } } })
      await prisma.executionEvent.deleteMany({ where: { executionId: { in: ids } } })
      await prisma.execution.deleteMany({ where: { id: { in: ids } } })
      await prisma.$disconnect()
    })
    it('returns one execution and one initial event for repeated requests', async () => {
      const key = randomUUID()
      const first = await store.createExecutionIdempotently(execution(key))
      const second = await store.createExecutionIdempotently(execution(key))
      expect(first.created).toBe(true)
      expect(second.created).toBe(false)
      expect(second.execution.id).toBe(first.execution.id)
      expect(await store.listEvents(first.execution.id)).toHaveLength(1)
      expect(await store.listAuditRecords(first.execution.id)).toHaveLength(1)
    })
    it('rejects reuse with different request content', async () => {
      const key = randomUUID()
      await store.createExecutionIdempotently(execution(key))
      await expect(
        store.createExecutionIdempotently(execution(key, { message: 'changed' })),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    })
    it('canonicalizes nested object keys while preserving array order', async () => {
      const key = randomUUID()
      const first = await store.createExecutionIdempotently(
        execution(key, { b: 2, a: { y: 2, x: 1 }, array: [1, 2] }),
      )
      const second = await store.createExecutionIdempotently(
        execution(key, { array: [1, 2], a: { x: 1, y: 2 }, b: 2 }),
      )
      expect(second.execution.id).toBe(first.execution.id)
      await expect(
        store.createExecutionIdempotently(
          execution(key, { a: { x: 1, y: 2 }, b: 2, array: [2, 1] }),
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    })
    it('uses database uniqueness to serialize concurrent duplicates across clients', async () => {
      const secondClient = new PrismaClient({
        datasources: {
          db: { url: process.env.AFR_TEST_DATABASE_URL ?? 'postgresql://localhost/unused' },
        },
      })
      const secondStore = new PostgresExecutionStore(secondClient)
      try {
        const key = randomUUID()
        const results = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            (i % 2 === 0 ? store : secondStore).createExecutionIdempotently(execution(key)),
          ),
        )
        expect(new Set(results.map((r) => r.execution.id)).size).toBe(1)
        expect(results.filter((r) => r.created)).toHaveLength(1)
        expect(await store.listEvents(results[0]!.execution.id)).toHaveLength(1)
      } finally {
        await secondClient.$disconnect()
      }
    })
    it('creates independent executions when the key is missing', async () => {
      const [first, second] = await Promise.all([
        store.createExecutionIdempotently(execution()),
        store.createExecutionIdempotently(execution()),
      ])
      expect(first.execution.id).not.toBe(second.execution.id)
    })
    it.each(['contains spaces', 'x'.repeat(129), 'é', 'bad\nkey'])(
      'rejects malformed key %s before any writes',
      async (key) => {
        const count = await prisma.execution.count({ where: { agentId } })
        await expect(store.createExecutionIdempotently(execution(key))).rejects.toMatchObject({
          code: 'INVALID_RECORD',
        })
        expect(await prisma.execution.count({ where: { agentId } })).toBe(count)
      },
    )
    it('rejects legacy key reuse when no durable fingerprint exists', async () => {
      const key = randomUUID()
      await store.createExecution(execution(key))
      await expect(store.createExecutionIdempotently(execution(key))).rejects.toMatchObject({
        code: 'CONFLICT',
      })
    })
    it('rejects non-JSON inputs before persistence', async () => {
      await expect(
        store.createExecutionIdempotently(execution(randomUUID(), { value: NaN })),
      ).rejects.toMatchObject({ code: 'INVALID_RECORD' })
    })
    it('rejects class instances and cyclic values without writing records', async () => {
      await expect(
        store.createExecutionIdempotently(execution(randomUUID(), { value: new Date() })),
      ).rejects.toMatchObject({ code: 'INVALID_RECORD' })
      const cyclic: Record<string, unknown> = {}
      cyclic.self = cyclic
      await expect(
        store.createExecutionIdempotently(execution(randomUUID(), cyclic)),
      ).rejects.toMatchObject({ code: 'INVALID_RECORD' })
    })
  },
)
