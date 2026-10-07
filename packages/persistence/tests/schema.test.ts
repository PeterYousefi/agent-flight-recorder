import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.AFR_TEST_DATABASE_URL ?? 'postgresql://localhost/unused' },
  },
})
const executionIds: string[] = []

async function createExecution(idempotencyKey?: string): Promise<string> {
  const execution = await prisma.execution.create({
    data: {
      agentId: 'agent-test',
      provider: 'mock',
      operation: 'schema-test',
      status: 'PENDING',
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      budgetPolicy: {
        maxCostUsd: 1,
        maxAttempts: 3,
      },
    },
  })
  executionIds.push(execution.id)
  return execution.id
}

describe.skipIf(process.env.AFR_TEST_DATABASE_URL === undefined)(
  'initial persistence schema',
  () => {
    beforeAll(async () => {
      await prisma.$connect()
    })

    afterAll(async () => {
      await prisma.auditRecord.deleteMany({ where: { executionId: { in: executionIds } } })
      await prisma.deadLetterRecord.deleteMany({ where: { executionId: { in: executionIds } } })
      await prisma.replayRelationship.deleteMany({
        where: { originalExecutionId: { in: executionIds } },
      })
      await prisma.artifact.deleteMany({ where: { executionId: { in: executionIds } } })
      await prisma.costRecord.deleteMany({ where: { executionId: { in: executionIds } } })
      await prisma.executionEvent.deleteMany({ where: { executionId: { in: executionIds } } })
      await prisma.executionAttempt.deleteMany({ where: { executionId: { in: executionIds } } })
      await prisma.execution.deleteMany({ where: { id: { in: executionIds } } })
      await prisma.$disconnect()
    })

    it('creates all expected tables', async () => {
      const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('executions', 'execution_attempts', 'execution_events', 'cost_records', 'artifacts', 'replay_relationships', 'dead_letters', 'audit_records')
      ORDER BY table_name
    `

      expect(tables.map(({ table_name }) => table_name)).toEqual([
        'artifacts',
        'audit_records',
        'cost_records',
        'dead_letters',
        'execution_attempts',
        'execution_events',
        'executions',
        'replay_relationships',
      ])
    })

    it('rejects duplicate execution idempotency keys', async () => {
      const key = `idempotency-${crypto.randomUUID()}`
      await createExecution(key)

      await expect(createExecution(key)).rejects.toMatchObject({ code: 'P2002' })
    })

    it('rejects duplicate attempt numbers and event sequences', async () => {
      const executionId = await createExecution()
      await prisma.executionAttempt.create({
        data: {
          executionId,
          attemptNumber: 1,
          status: 'RUNNING',
          startedAt: new Date(),
        },
      })
      await expect(
        prisma.executionAttempt.create({
          data: {
            executionId,
            attemptNumber: 1,
            status: 'RUNNING',
            startedAt: new Date(),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' })

      await prisma.executionEvent.create({
        data: {
          executionId,
          eventType: 'execution.created',
          sequence: 1,
          schemaVersion: 1,
          timestamp: new Date(),
          payload: { agentId: 'agent-test' },
        },
      })
      await expect(
        prisma.executionEvent.create({
          data: {
            executionId,
            eventType: 'execution.queued',
            sequence: 1,
            schemaVersion: 1,
            timestamp: new Date(),
            payload: {},
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' })
    })

    it('rejects foreign-key references to missing executions', async () => {
      await expect(
        prisma.executionEvent.create({
          data: {
            executionId: crypto.randomUUID(),
            eventType: 'execution.created',
            sequence: 1,
            schemaVersion: 1,
            timestamp: new Date(),
            payload: {},
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' })
    })

    it('rejects self-replay relationships', async () => {
      const executionId = await createExecution()

      await expect(
        prisma.replayRelationship.create({
          data: {
            originalExecutionId: executionId,
            replayExecutionId: executionId,
            replayMode: 'simulation',
          },
        }),
      ).rejects.toThrow('replay_relationships_distinct_executions_check')
    })

    it('preserves exact integer micro-dollar amounts', async () => {
      const executionId = await createExecution()
      const amountMicroUsd = 9007199254740993n
      const cost = await prisma.costRecord.create({
        data: {
          executionId,
          category: 'provider',
          kind: 'measured',
          amountMicroUsd,
        },
      })

      expect(cost.amountMicroUsd).toBe(amountMicroUsd)
    })

    it('restricts deletion of executions with historical records', async () => {
      const executionId = await createExecution()
      await prisma.executionEvent.create({
        data: {
          executionId,
          eventType: 'execution.created',
          sequence: 1,
          schemaVersion: 1,
          timestamp: new Date(),
          payload: {},
        },
      })

      await expect(prisma.execution.delete({ where: { id: executionId } })).rejects.toMatchObject({
        code: 'P2003',
      })
    })
  },
)
