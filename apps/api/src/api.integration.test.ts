import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresExecutionStore } from '@afr/persistence'
import {
  ExecutionOrchestrator,
  ExecutionProcessor,
  ProviderRegistry,
  ReplayService,
  DeadLetterService,
  OutboxDispatcher,
} from '@afr/application'
import { InMemoryArtifactStore, InMemoryMessageBus } from '@afr/adapters'
import { MockProvider } from '@afr/providers'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { createApi } from './server.js'
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.AFR_TEST_DATABASE_URL ?? 'postgresql://localhost/unused' },
  },
})
const store = new PostgresExecutionStore(prisma)
const registry = new ProviderRegistry([new MockProvider()])
const orchestrator = new ExecutionOrchestrator(store, registry)
const artifacts = new InMemoryArtifactStore()
const processor = new ExecutionProcessor(store, registry, artifacts)
const bus = new InMemoryMessageBus()
const dispatcher = new OutboxDispatcher(store, bus)
const agentId = `api-test-${randomUUID()}`
let api: FastifyInstance
const body = {
  agent_id: agentId,
  operation: 'success',
  input: {},
  budget_policy: { max_attempts: 3, max_cost_usd: 1 },
}
describe.skipIf(process.env.AFR_TEST_DATABASE_URL === undefined)(
  'HTTP execution control with PostgreSQL',
  () => {
    beforeAll(async () => {
      await bus.subscribe((m) => processor.handle(m))
      api = await createApi({
        store,
        orchestrator,
        artifacts,
        replay: new ReplayService(store, registry, orchestrator),
        deadLetters: new DeadLetterService(store, orchestrator),
        ready: async () => {
          await prisma.$queryRaw`SELECT 1`
          return true
        },
      })
    })
    afterAll(async () => {
      await api.close()
      await bus.close()
      const ids = (
        await prisma.execution.findMany({ where: { agentId }, select: { id: true } })
      ).map((r) => r.id)
      const where = { executionId: { in: ids } }
      await prisma.replayRelationship.deleteMany({ where: { replayExecutionId: { in: ids } } })
      await prisma.deadLetterRequeue.deleteMany({ where: { newExecutionId: { in: ids } } })
      await prisma.deadLetterRecord.deleteMany({ where })
      await prisma.messageOutbox.deleteMany({ where })
      await prisma.auditRecord.deleteMany({ where })
      await prisma.costRecord.deleteMany({ where })
      await prisma.artifact.deleteMany({ where })
      await prisma.executionEvent.deleteMany({ where })
      await prisma.executionAttempt.deleteMany({ where })
      await prisma.execution.deleteMany({
        where: { id: { in: ids }, originalExecutionId: { not: null } },
      })
      await prisma.execution.deleteMany({ where: { id: { in: ids } } })
      await prisma.$disconnect()
    })
    it('queues, processes and reads a real execution, cost and private artifact', async () => {
      const response = await api.inject({
        method: 'POST',
        url: '/api/v1/executions',
        payload: body,
      })
      expect(response.statusCode).toBe(202)
      expect(response.headers['x-request-id']).toBeTruthy()
      const id = response.json<{ id: string }>().id
      expect(response.json().status).toBe('QUEUED')
      await dispatcher.dispatch()
      await bus.drain()
      expect((await api.inject(`/api/v1/executions/${id}`)).json().status).toBe('SUCCEEDED')
      const events = (await api.inject(`/api/v1/executions/${id}/events`)).json().items
      expect(events.at(-1).event_type).toBe('execution.succeeded')
      expect((await api.inject(`/api/v1/executions/${id}/cost`)).json().measured_micro_usd).toBe(
        '4000',
      )
      const summary = (await api.inject('/api/v1/executions?limit=100'))
        .json()
        .items.find((item: { id: string }) => item.id === id).summary
      expect(summary).toEqual({
        execution_id: id,
        attempt_count: 1,
        estimated_micro_usd: '5000',
        measured_micro_usd: '4000',
      })
      const overview = await api.inject('/api/v1/overview')
      expect(overview.statusCode).toBe(200)
      expect(overview.json().succeeded).toBeGreaterThanOrEqual(1)
      expect(overview.json().p50_seconds).toBeGreaterThanOrEqual(0)
      expect(overview.json().hourly.length).toBeGreaterThanOrEqual(1)
      const artifactId = (await api.inject(`/api/v1/executions/${id}/artifacts`)).json().items[0].id
      expect(
        (await api.inject(`/api/v1/executions/${id}/artifacts/${artifactId}`)).json().content,
      ).toBeTruthy()
      const replay = await api.inject({
        method: 'POST',
        url: `/api/v1/executions/${id}/replay`,
        payload: { mode: 'simulation' },
      })
      expect(replay.statusCode).toBe(202)
      expect(replay.json().id).not.toBe(id)
      expect((await api.inject(`/api/v1/executions/${id}/events`)).json().items).toEqual(events)
      expect(
        (await api.inject({ method: 'POST', url: `/api/v1/executions/${id}/cancel` })).statusCode,
      ).toBe(409)
    })
    it('honors durable idempotency and rejects mismatched requests', async () => {
      const key = randomUUID()
      const call = (input: object): Promise<LightMyRequestResponse> =>
        api.inject({
          method: 'POST',
          url: '/api/v1/executions',
          headers: { 'idempotency-key': key },
          payload: { ...body, input },
        })
      const first = await call({})
      const second = await call({})
      expect(second.statusCode).toBe(200)
      expect(second.json().id).toBe(first.json().id)
      expect((await call({ changed: true })).statusCode).toBe(409)
    })
    it('validates payloads, pagination and IDs and sanitizes errors', async () => {
      for (const url of [
        '/api/v1/executions?limit=101',
        '/api/v1/executions/bad',
        '/api/v1/executions?offset=-1',
      ])
        expect((await api.inject(url)).statusCode).toBe(400)
      expect((await api.inject(`/api/v1/executions/${randomUUID()}`)).statusCode).toBe(404)
      expect(
        (
          await api.inject({
            method: 'POST',
            url: '/api/v1/executions',
            payload: { ...body, secret: 'invalid' },
          })
        ).statusCode,
      ).toBe(400)
      const huge = await api.inject({
        method: 'POST',
        url: '/api/v1/executions',
        payload: { ...body, input: { text: 'x'.repeat(1048576) } },
      })
      expect(huge.statusCode).toBe(413)
      expect(huge.body).not.toContain('stack')
      expect(huge.headers['x-content-type-options']).toBe('nosniff')
    })
    it('requeues a historical dead letter into a new execution', async () => {
      const created = await api.inject({
        method: 'POST',
        url: '/api/v1/executions',
        payload: { ...body, operation: 'permanent_failure' },
      })
      const id = created.json().id
      await dispatcher.dispatch()
      await bus.drain()
      const record = (await store.listDeadLetters({ limit: 100 })).find(
        (r) => r.executionId === id,
      )!
      const requeued = await api.inject({
        method: 'POST',
        url: `/api/v1/dead-letter/${record.id}/requeue`,
      })
      expect(requeued.statusCode).toBe(202)
      expect(requeued.json().id).not.toBe(id)
      expect((await api.inject(`/api/v1/executions/${id}`)).json().status).toBe('DEAD_LETTERED')
    })
    it('lists and queues credential-free demos and identifies the replay followup', async () => {
      expect((await api.inject('/api/v1/demo/scenarios')).json().items).toHaveLength(10)
      // Use the existing test agent so cleanup stays scoped to this suite.
      const create = orchestrator.create.bind(orchestrator)
      orchestrator.create = (value) => create({ ...(value as object), agentId })
      try {
        const response = await api.inject({
          method: 'POST',
          url: '/api/v1/demo/scenarios/replay/run',
        })
        expect(response.statusCode).toBe(202)
        expect(response.json().provider).toBe('mock')
        expect(response.json().followup_replay).toBe(true)
        expect(response.json().synthetic_costs).toBe(true)
        expect(
          (await api.inject({ method: 'POST', url: '/api/v1/demo/scenarios/unknown/run' }))
            .statusCode,
        ).toBe(400)
      } finally {
        orchestrator.create = create
      }
    })
    it('exposes readiness and documented routes without credentials', async () => {
      expect((await api.inject('/api/v1/health')).statusCode).toBe(200)
      expect((await api.inject('/api/v1/ready')).statusCode).toBe(200)
      const spec = (await api.inject('/api/docs/json')).json()
      expect(spec.paths['/api/v1/executions'].post.requestBody).toBeTruthy()
      expect(JSON.stringify(spec)).not.toContain('afr_password')
      expect((await api.inject('/api/v1/executions?limit=1')).json().items).toHaveLength(1)
    })
  },
)
