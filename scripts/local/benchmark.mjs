import { performance } from 'node:perf_hooks'
import { randomUUID } from 'node:crypto'
import { cpus, platform, arch, totalmem } from 'node:os'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
const api = 'http://127.0.0.1:3000/api/v1'
const samples = Number(process.env.AFR_BENCHMARK_SAMPLES ?? 30)
if (!Number.isInteger(samples) || samples < 10 || samples > 100)
  throw new Error('Samples must be 10–100')
async function request(path, body) {
  const response = await fetch(api + path, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error(`Benchmark request failed: HTTP ${response.status}`)
  return response.json()
}
function summary(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
  return {
    samples: values.length,
    mean_ms: Number((values.reduce((n, v) => n + v, 0) / values.length).toFixed(2)),
    p50_ms: Number(percentile(0.5).toFixed(2)),
    p95_ms: Number(percentile(0.95).toFixed(2)),
    max_ms: Number(sorted.at(-1).toFixed(2)),
  }
}
const listing = []
for (let n = 0; n < samples + 5; n++) {
  const start = performance.now()
  await request('/executions?limit=25')
  if (n >= 5) listing.push(performance.now() - start)
}
const created = []
const creates = []
const batchStart = performance.now()
for (let n = 0; n < samples; n++) {
  const start = performance.now()
  created.push(
    await request('/executions', {
      agent_id: `benchmark-${randomUUID()}`,
      provider: 'mock',
      operation: 'success',
      input: { scenario: 'success' },
      budget_policy: {
        max_cost_usd: 0.1,
        max_duration_seconds: 60,
        max_attempts: 3,
        max_tool_calls: 10,
      },
    }),
  )
  creates.push(performance.now() - start)
}
const results = await Promise.all(
  created.map(async ({ id }) => {
    const timeout = Date.now() + 60000
    let execution
    do {
      execution = await request(`/executions/${id}`)
      if (execution.status === 'SUCCEEDED') break
      if (['DEAD_LETTERED', 'FAILED', 'BUDGET_EXCEEDED', 'CANCELLED'].includes(execution.status))
        throw new Error('Benchmark execution did not succeed')
      if (Date.now() > timeout) throw new Error('Benchmark execution timed out')
      await delay(50)
    } while (true)
    const page = await request(`/executions/${id}/events?limit=100`)
    const event = (type) => page.items.find((fact) => fact.event_type === type)
    for (const type of [
      'execution.created',
      'execution.queued',
      'execution.started',
      'execution.succeeded',
    ])
      if (!event(type)) throw new Error('Benchmark fact missing')
    return {
      id,
      scheduling:
        Date.parse(event('execution.queued').timestamp) -
        Date.parse(event('execution.created').timestamp),
      queueToWorker:
        Date.parse(event('execution.started').timestamp) -
        Date.parse(event('execution.queued').timestamp),
      endToEnd:
        Date.parse(event('execution.succeeded').timestamp) -
        Date.parse(event('execution.created').timestamp),
    }
  }),
)
const batchSeconds = (performance.now() - batchStart) / 1000
const histories = []
for (let n = 0; n < samples + 5; n++) {
  const start = performance.now()
  await request(`/executions/${results[n % results.length].id}/events?limit=100`)
  if (n >= 5) histories.push(performance.now() - start)
}
const report = {
  captured_at: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: platform(),
    architecture: arch(),
    cpu: cpus()[0]?.model ?? 'unknown',
    logical_cpus: cpus().length,
    memory_gib: Number((totalmem() / 1024 ** 3).toFixed(1)),
    worker_concurrency: 5,
    provider: 'mock',
    storage: 'private Azurite',
    queue: 'official Service Bus emulator',
    database: 'local PostgreSQL 16',
  },
  methodology:
    'Five warmed-up list/event reads; sequential HTTP creation requests; worker concurrency five; success scenario only. Persisted event timestamps measure scheduling and queue-to-worker delay. Batch duration includes terminal polling (50 ms) and history reads. These local single-process samples are not production capacity claims. Benchmark executions/artifacts remain inspectable.',
  api_list: summary(listing),
  api_create: summary(creates),
  event_history_read: summary(histories),
  scheduling: summary(results.map((r) => r.scheduling)),
  queue_to_worker: summary(results.map((r) => r.queueToWorker)),
  execution_wall: summary(results.map((r) => r.endToEnd)),
  batch: {
    executions: samples,
    elapsed_seconds: Number(batchSeconds.toFixed(3)),
    executions_per_second: Number((samples / batchSeconds).toFixed(2)),
  },
}
await mkdir('benchmark-results', { recursive: true })
await writeFile('benchmark-results/latest.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
