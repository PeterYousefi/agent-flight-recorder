import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createNonNegativeMoney,
  ExecutionStatus,
  ProviderFailureCategory,
  type ExecutionProvider,
  type ProviderExecutionResult,
} from '@afr/domain'
import { InMemoryMessageBus, InMemoryArtifactStore } from '@afr/adapters'
import {
  ExecutionOrchestrator,
  ExecutionProcessor,
  OutboxDispatcher,
  ProviderRegistry,
  ProviderDeadlineError,
  type ProviderTiming,
} from '@afr/application'
import { PostgresExecutionStore } from '../src/index.js'
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.AFR_TEST_DATABASE_URL ?? 'postgresql://localhost/unused' },
  },
})
const store = new PostgresExecutionStore(prisma)
const agentId = `retry-test-${randomUUID()}`
let now = new Date()
const runtime = { now: () => now, id: randomUUID }
const policy = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, random: () => 0.5 }
let calls = 0
const provider: ExecutionProvider = {
  name: 'retry-fixture',
  capabilities: {
    supportsCancellation: false,
    supportsCostEstimation: true,
    supportsMeasuredCost: false,
    supportsToolExecution: true,
  },
  validateRequest: () => Promise.resolve({ valid: true, errors: [] }),
  estimateCost: () => Promise.resolve(createNonNegativeMoney(0.001)),
  execute: (request) => {
    calls++
    if (request.operation === 'transient' && request.attemptNumber > 1)
      return Promise.resolve({ kind: 'SUCCEEDED', output: { ok: true } })
    return Promise.resolve({
      kind: 'FAILED',
      error: {
        code: request.operation === 'rate_limit' ? 'RATE_LIMITED' : 'TEST_FAILURE',
        message: 'Fixture failure',
        retryable: request.operation !== 'permanent',
        category:
          request.operation === 'rate_limit'
            ? ProviderFailureCategory.RATE_LIMITED
            : ProviderFailureCategory.RETRYABLE,
        ...(request.operation === 'rate_limit' ? { retryAfterMs: 5000 } : {}),
      },
    })
  },
  normalizeResult: (raw) => raw as unknown as ProviderExecutionResult,
  healthCheck: () => Promise.resolve({ status: 'healthy', checkedAt: now.toISOString() }),
}
const registry = new ProviderRegistry([provider])
const artifacts = new InMemoryArtifactStore()
const orchestrator = new ExecutionOrchestrator(store, registry, runtime)
async function harness(
  operation: string,
  timing?: ProviderTiming,
): Promise<{ id: string; bus: InMemoryMessageBus; dispatcher: OutboxDispatcher }> {
  const id = (
    await orchestrator.create({
      agentId,
      provider: provider.name,
      operation,
      input: {},
      budgetPolicy: { maxCostUsd: 1, maxAttempts: 3, maxDurationSeconds: 300, maxToolCalls: 10 },
    })
  ).execution.id
  const bus = new InMemoryMessageBus({ now: () => now.getTime() })
  const processor = new ExecutionProcessor(
    store,
    registry,
    artifacts,
    runtime,
    60000,
    policy,
    timing,
  )
  await bus.subscribe((message) => processor.handle(message))
  const dispatcher = new OutboxDispatcher(store, bus, runtime)
  await dispatcher.dispatch()
  await bus.drain()
  return { id, bus, dispatcher }
}
describe.skipIf(process.env.AFR_TEST_DATABASE_URL === undefined)('durable retry scheduling', () => {
  afterAll(async () => {
    const ids = (await prisma.execution.findMany({ where: { agentId }, select: { id: true } })).map(
      (r) => r.id,
    )
    const where = { executionId: { in: ids } }
    await prisma.messageOutbox.deleteMany({ where })
    await prisma.auditRecord.deleteMany({ where })
    await prisma.artifact.deleteMany({ where })
    await prisma.costRecord.deleteMany({ where })
    await prisma.executionEvent.deleteMany({ where })
    await prisma.executionAttempt.deleteMany({ where })
    await prisma.execution.deleteMany({ where: { id: { in: ids } } })
    await prisma.$disconnect()
  })
  it('persists due times, does not retry early, then succeeds on the next attempt', async () => {
    const { id, bus, dispatcher } = await harness('transient')
    expect((await store.getExecution(id))?.status).toBe(ExecutionStatus.RETRY_SCHEDULED)
    const before = calls
    expect(await dispatcher.dispatch()).toBe(0)
    now = new Date(now.getTime() + 749)
    expect(await dispatcher.dispatch()).toBe(0)
    expect(calls).toBe(before)
    now = new Date(now.getTime() + 1)
    await dispatcher.dispatch()
    await bus.drain()
    expect((await store.getExecution(id))?.status).toBe(ExecutionStatus.SUCCEEDED)
    expect((await store.listAttempts(id)).map((a) => a.status)).toEqual(['FAILED', 'SUCCEEDED'])
  })
  it('bounds transient failures to the maximum attempts', async () => {
    const { id, bus, dispatcher } = await harness('always_fail')
    for (let i = 0; i < 3; i++) {
      now = new Date(now.getTime() + 30000)
      await dispatcher.dispatch()
      await bus.drain()
    }
    expect((await store.getExecution(id))?.status).toBe(ExecutionStatus.FAILED)
    expect(await store.listAttempts(id)).toHaveLength(3)
  })
  it('never schedules permanent errors', async () => {
    const { id } = await harness('permanent')
    expect((await store.getExecution(id))?.status).toBe(ExecutionStatus.FAILED)
    expect(
      (await store.listEvents(id)).some((e) => e.eventType === 'execution.retry_scheduled'),
    ).toBe(false)
  })
  it('honors provider rate-limit timing', async () => {
    const { id, bus, dispatcher } = await harness('rate_limit')
    const retry = (await store.listEvents(id)).find(
      (e) => e.eventType === 'execution.retry_scheduled',
    )
    expect(
      retry?.eventType === 'execution.retry_scheduled' &&
        Date.parse(retry.payload.nextRetryAt) - now.getTime(),
    ).toBe(5000)
    await orchestrator.cancel(id)
    now = new Date(now.getTime() + 5000)
    await dispatcher.dispatch()
    await bus.drain()
    expect((await store.getExecution(id))?.status).toBe(ExecutionStatus.CANCELLED)
    expect(await store.listAttempts(id)).toHaveLength(1)
  })
  it('classifies provider deadline expiry as retryable using injected timing', async () => {
    let timedCalls = 0
    const timing: ProviderTiming = {
      run: <T>(work: () => Promise<T>): Promise<T> =>
        ++timedCalls % 2 === 0 ? Promise.reject(new ProviderDeadlineError()) : work(),
    }
    const { id } = await harness('transient', timing)
    expect((await store.getExecution(id))?.status).toBe(ExecutionStatus.RETRY_SCHEDULED)
    expect((await store.listAttempts(id))[0]?.errorCode).toBe('PROVIDER_TIMEOUT')
  })
})
