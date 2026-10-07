import Fastify, { LogController, type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { traced, parentContext } from '@afr/observability'
import { randomUUID } from 'node:crypto'
import { ZodError } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import {
  DomainError,
  ReplayMode,
  type Execution,
  type ExecutionStore,
  type ArtifactStore,
  type ArtifactKind,
} from '@afr/domain'
import {
  ApplicationError,
  type ExecutionOrchestrator,
  type DeadLetterService,
  type ReplayService,
} from '@afr/application'
import { PersistenceError } from '@afr/persistence'
import {
  createSchema,
  querySchema,
  idSchema,
  replaySchema,
  executionDto,
  requestDto,
  snake,
} from './contracts.js'

export interface ApiDependencies {
  readonly store: ExecutionStore
  readonly orchestrator: ExecutionOrchestrator
  readonly deadLetters: DeadLetterService
  readonly replay: ReplayService
  readonly artifacts: ArtifactStore
  readonly ready: () => Promise<boolean>
}
export async function createApi(deps: ApiDependencies): Promise<FastifyInstance> {
  const api = Fastify({
    logger: false,
    bodyLimit: 1048576,
    genReqId: () => randomUUID(),
    logController: new LogController({ disableRequestLogging: true }),
    ajv: { customOptions: { removeAdditional: false, useDefaults: false } },
  })
  await api.register(cors, { origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] })
  api.addHook('onRoute', (route) => {
    if (!route.url.startsWith('/api/v1/')) return
    const method = String(route.method)
    const json = (
      value: Parameters<typeof zodToJsonSchema>[0],
    ): ReturnType<typeof zodToJsonSchema> =>
      zodToJsonSchema(value, { target: 'jsonSchema7', $refStrategy: 'none' })
    const current = route.schema ?? {}
    if (route.url.includes(':id'))
      current.params = {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          ...(route.url.includes(':artifactId')
            ? { artifactId: { type: 'string', format: 'uuid' } }
            : {}),
        },
      }
    if (
      method === 'GET' &&
      (route.url.endsWith('/executions') ||
        route.url.endsWith('/events') ||
        route.url.endsWith('/dead-letter'))
    )
      current.querystring = json(querySchema)
    if (method === 'POST' && route.url.endsWith('/executions')) current.body = json(createSchema)
    if (method === 'POST' && route.url.endsWith('/replay')) current.body = json(replaySchema)
    route.schema = current
    const originalHandler = route.handler
    const action = route.url.endsWith('/replay')
      ? 'execution.replay'
      : route.url.endsWith('/requeue')
        ? 'dead_letter.requeue'
        : method === 'POST' && route.url.endsWith('/executions')
          ? 'execution.create'
          : 'api.handle'
    route.handler = function (request, reply) {
      const incoming = request.headers.traceparent
      return traced(
        'http.request',
        {
          'http.request.method': request.method,
          'http.route': route.url,
          'request.id': request.id,
        },
        () => traced(action, {}, () => Promise.resolve(originalHandler.call(this, request, reply))),
        parentContext(typeof incoming === 'string' ? incoming : undefined),
      )
    }
  })
  await api.register(swagger, {
    openapi: { info: { title: 'Agent Flight Recorder API', version: '1.0.0' } },
  })
  await api.register(swaggerUi, { routePrefix: '/api/docs', uiConfig: { docExpansion: 'list' } })
  api.addHook('onSend', async (request, reply) => {
    reply
      .header('x-request-id', request.id)
      .header('x-content-type-options', 'nosniff')
      .header('referrer-policy', 'no-referrer')
      .header('cache-control', 'no-store')
  })
  api.setErrorHandler((error, request, reply) => {
    let status = 500
    let code = 'INTERNAL_ERROR'
    let message = 'Request could not be completed'
    if (error instanceof ZodError || error instanceof DomainError) {
      status = error instanceof DomainError && error.code === 'INVALID_STATE_TRANSITION' ? 409 : 400
      code = error instanceof DomainError ? error.code : 'INVALID_REQUEST'
      message = 'Request failed validation'
    } else if (error instanceof ApplicationError || error instanceof PersistenceError) {
      code = error.code
      status =
        code === 'NOT_FOUND'
          ? 404
          : code === 'CONFLICT'
            ? 409
            : code === 'PROVIDER_UNAVAILABLE'
              ? 503
              : 400
      message = error.message
    } else if (typeof error === 'object' && error !== null && 'statusCode' in error) {
      const candidate = error.statusCode
      if (candidate === 400 || candidate === 413) {
        status = candidate
        code = candidate === 413 ? 'BODY_TOO_LARGE' : 'INVALID_REQUEST'
        message = 'Request failed validation'
      }
    }
    void reply.code(status).send({ error: { code, message, request_id: request.id } })
  })
  const schema = (summary: string): { summary: string; tags: string[] } => ({
    summary,
    tags: ['Executions'],
  })
  const load = async (params: unknown): Promise<Execution> => {
    const { id } = idSchema.parse(params)
    const execution = await deps.store.getExecution(id)
    if (execution === undefined) throw new ApplicationError('NOT_FOUND', 'Execution is missing')
    return execution
  }
  api.post(
    '/api/v1/executions',
    { schema: schema('Create and queue an execution') },
    async (req, reply) => {
      const body = createSchema.parse(req.body)
      const header = req.headers['idempotency-key']
      if (header !== undefined) {
        if (
          typeof header !== 'string' ||
          (body.idempotency_key !== undefined && body.idempotency_key !== header)
        )
          throw new ApplicationError('INVALID_REQUEST', 'Idempotency keys disagree')
        body.idempotency_key = header
      }
      const validated = createSchema.parse(body)
      const result = await deps.orchestrator.create(requestDto(validated))
      reply
        .code(result.created ? 202 : 200)
        .header('location', `/api/v1/executions/${result.execution.id}`)
      return { ...executionDto(result.execution), created: result.created }
    },
  )
  api.get('/api/v1/executions', { schema: schema('List execution snapshots') }, async (req) => {
    const query = querySchema.parse(req.query)
    const items = await deps.store.listExecutions({
      limit: query.limit,
      offset: query.offset,
      ...(query.status === undefined ? {} : { status: query.status }),
    })
    return {
      items: items.map(executionDto),
      next_offset: items.length === query.limit ? query.offset + query.limit : null,
    }
  })
  api.get(
    '/api/v1/executions/:id',
    { schema: schema('Inspect execution and attempts') },
    async (req) => {
      const execution = await load(req.params)
      return {
        ...executionDto(execution),
        attempts: snake(await deps.store.listAttempts(execution.id)),
        replay: snake((await deps.store.getReplayRelationship(execution.id)) ?? null),
      }
    },
  )
  api.get(
    '/api/v1/executions/:id/events',
    { schema: schema('List events in authoritative sequence order') },
    async (req) => {
      const execution = await load(req.params)
      const query = querySchema.parse(req.query)
      const events = await deps.store.listEvents(execution.id)
      const items = events.slice(query.offset, query.offset + query.limit)
      return {
        items: snake(items),
        next_offset:
          query.offset + items.length < events.length ? query.offset + items.length : null,
      }
    },
  )
  api.get(
    '/api/v1/executions/:id/cost',
    { schema: schema('Inspect estimated and measured micro-dollar records') },
    async (req) => {
      const execution = await load(req.params)
      const costs = await deps.store.listCosts(execution.id)
      const sum = (kind: 'estimated' | 'measured'): string | null => {
        const matching = costs.filter((c) => c.kind === kind)
        return matching.length === 0
          ? null
          : matching.reduce((n, c) => n + c.amountMicroUsd, 0n).toString()
      }
      return {
        estimated_micro_usd: sum('estimated'),
        measured_micro_usd: sum('measured'),
        records: snake(costs),
      }
    },
  )
  api.post(
    '/api/v1/executions/:id/cancel',
    { schema: schema('Cancel an active execution') },
    async (req) => executionDto(await deps.orchestrator.cancel(idSchema.parse(req.params).id)),
  )
  api.post(
    '/api/v1/executions/:id/replay',
    { schema: schema('Replay into a new execution') },
    async (req, reply) => {
      const body = replaySchema.parse(req.body ?? {})
      const execution = await deps.replay.replay(idSchema.parse(req.params).id, {
        mode: body.mode,
        carryBudget: body.carry_budget,
        ...(body.scenario === undefined ? {} : { scenario: body.scenario }),
      })
      reply.code(202)
      return executionDto(execution)
    },
  )
  api.post(
    '/api/v1/executions/:id/retry',
    { schema: schema('Retry a terminal execution as input replay') },
    async (req, reply) => {
      const original = await load(req.params)
      if (!['FAILED', 'DEAD_LETTERED', 'BUDGET_EXCEEDED'].includes(original.status))
        throw new ApplicationError('CONFLICT', 'Retry requires a failed execution')
      reply.code(202)
      return executionDto(await deps.replay.replay(original.id, { mode: ReplayMode.INPUT }))
    },
  )
  api.get(
    '/api/v1/dead-letter',
    { schema: schema('List immutable historical dead letters') },
    async (req) => {
      const query = querySchema.parse(req.query)
      const items = await deps.store.listDeadLetters({ limit: query.limit, offset: query.offset })
      return {
        items: await Promise.all(
          items.map(async (r) => ({
            ...(snake(r) as object),
            requeued_execution_id: (await deps.store.getRequeuedExecutionId(r.id)) ?? null,
          })),
        ),
        next_offset: items.length === query.limit ? query.offset + query.limit : null,
      }
    },
  )
  api.post(
    '/api/v1/dead-letter/:id/requeue',
    { schema: schema('Requeue a dead letter as a new execution') },
    async (req, reply) => {
      reply.code(202)
      return executionDto(await deps.deadLetters.requeue(idSchema.parse(req.params).id))
    },
  )
  api.get(
    '/api/v1/executions/:id/artifacts',
    { schema: schema('List private artifact metadata') },
    async (req) => {
      const execution = await load(req.params)
      const items = await deps.store.listArtifacts(execution.id)
      return {
        items: items.map((a) => ({
          id: a.id,
          execution_id: a.executionId,
          kind: a.kind,
          content_type: a.contentType,
          size_bytes: a.sizeBytes.toString(),
          checksum: a.checksum,
          created_at: a.createdAt.toISOString(),
        })),
      }
    },
  )
  api.get(
    '/api/v1/executions/:id/artifacts/:artifactId',
    { schema: schema('Read an execution-owned artifact') },
    async (req) => {
      const execution = await load(req.params)
      const artifactId = (req.params as { artifactId: string }).artifactId
      const metadata = (await deps.store.listArtifacts(execution.id)).find(
        (a) => a.id === artifactId,
      )
      if (metadata === undefined) throw new ApplicationError('NOT_FOUND', 'Artifact is missing')
      const artifact = await deps.artifacts.get({
        artifactId,
        executionId: execution.id,
        kind: metadata.kind as ArtifactKind,
      })
      return snake(artifact)
    },
  )
  api.get('/api/v1/health', { schema: { summary: 'Liveness' } }, async () => ({ status: 'ok' }))
  api.get('/api/v1/ready', { schema: { summary: 'Dependency readiness' } }, async (_req, reply) => {
    const ready = await deps.ready().catch(() => false)
    reply.code(ready ? 200 : 503)
    return { status: ready ? 'ready' : 'unavailable' }
  })
  return api
}
