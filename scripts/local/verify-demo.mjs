import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
const base = 'http://127.0.0.1:3000/api/v1'
async function api(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  })
  assert.ok(response.ok, `${method} ${path}: ${response.status}`)
  return response.json()
}
async function wait(
  id,
  predicate = (e) =>
    ['SUCCEEDED', 'DEAD_LETTERED', 'BUDGET_EXCEEDED', 'CANCELLED'].includes(e.status),
) {
  for (let n = 0; n < 200; n++) {
    const execution = await api(`/executions/${id}`)
    if (predicate(execution)) return execution
    await delay(100)
  }
  throw new Error(`Execution ${id} timed out`)
}
async function scenario(id, expected) {
  const execution = await api(`/demo/scenarios/${id}/run`, 'POST')
  assert.equal(execution.provider, 'mock')
  assert.equal(execution.synthetic_costs, true)
  assert.equal((await wait(execution.id)).status, expected)
  process.stdout.write(`${id}: ${expected}\n`)
  return execution.id
}
assert.equal((await api('/ready')).status, 'ready')
const success = await scenario('success', 'SUCCEEDED')
const transient = await scenario('transient_failure', 'SUCCEEDED')
assert.equal((await api(`/executions/${transient}`)).attempts.length, 2)
const transientEvents = (await api(`/executions/${transient}/events?limit=100`)).items
assert.ok(transientEvents.some((e) => e.event_type === 'execution.retry_scheduled'))
await scenario('rate_limit', 'SUCCEEDED')
await scenario('timeout', 'DEAD_LETTERED')
await scenario('budget_exceeded', 'BUDGET_EXCEEDED')
const warning = await scenario('budget_warning', 'SUCCEEDED')
assert.ok(
  (await api(`/executions/${warning}/events?limit=100`)).items.some(
    (e) => e.event_type === 'budget.warning',
  ),
)
await scenario('permanent_failure', 'DEAD_LETTERED')
const dead = await scenario('dead_letter', 'DEAD_LETTERED')
const before = await api(`/executions/${dead}`)
const history = await api(`/executions/${dead}/events?limit=100`)
const record = (await api('/dead-letter?limit=100')).items.find((r) => r.execution_id === dead)
assert.ok(record)
const requeue = await api(`/dead-letter/${record.id}/requeue`, 'POST')
assert.notEqual(requeue.id, dead)
assert.equal(requeue.original_execution_id, dead)
assert.deepEqual(await api(`/executions/${dead}`), before)
assert.deepEqual(await api(`/executions/${dead}/events?limit=100`), history)
const source = await api('/demo/scenarios/replay/run', 'POST')
assert.equal(source.followup_replay, true)
await wait(source.id)
const sourceHistory = await api(`/executions/${source.id}/events?limit=100`)
const replay = await api(`/executions/${source.id}/replay`, 'POST', { mode: 'simulation' })
assert.notEqual(replay.id, source.id)
assert.equal((await wait(replay.id)).status, 'SUCCEEDED')
assert.deepEqual(await api(`/executions/${source.id}/events?limit=100`), sourceHistory)
const cancellation = await api('/demo/scenarios/cancellation/run', 'POST')
await wait(cancellation.id, (e) => e.status === 'RUNNING')
assert.equal((await api(`/executions/${cancellation.id}/cancel`, 'POST')).status, 'CANCELLED')
const artifacts = (await api(`/executions/${success}/artifacts`)).items
assert.ok(artifacts.length > 0)
assert.equal(
  (await api(`/executions/${success}/artifacts/${artifacts[0].id}`)).content.simulated,
  true,
)
const events = (await api(`/executions/${transient}/events?limit=100`)).items
const traceId = events.find((e) => e.correlation?.trace_id)?.correlation.trace_id
assert.match(traceId, /^[a-f0-9]{32}$/)
let trace
for (let n = 0; n < 60; n++) {
  const response = await fetch(`http://127.0.0.1:3200/api/traces/${traceId}`, {
    headers: { accept: 'application/json' },
  })
  if (response.ok) {
    trace = await response.json()
    break
  }
  await delay(500)
}
assert.ok(trace, 'Tempo trace not found')
const spans = (trace.batches ?? trace.resourceSpans ?? []).flatMap((b) =>
  (b.scopeSpans ?? b.instrumentationLibrarySpans ?? []).flatMap((s) => s.spans ?? []),
)
for (const name of [
  'http.request',
  'queue.publish',
  'queue.consume',
  'worker.process',
  'provider.execute',
  'artifact.put',
])
  assert.ok(
    spans.some((s) => s.name === name),
    `Missing span ${name}`,
  )
const requiredMetrics = [
  'afr_executions_total',
  'afr_executions_succeeded_total',
  'afr_execution_retry_total',
  'afr_dead_letter_total',
  'afr_budget_rejections_total',
  'afr_estimated_execution_cost_USD_total',
]
let missingMetrics = [...requiredMetrics]
// Metrics export independently of trace export; allow the 5-second reader to flush.
for (let n = 0; n < 60; n++) {
  const response = await fetch('http://127.0.0.1:8889/metrics', {
    signal: AbortSignal.timeout(3000),
  })
  assert.ok(response.ok, 'Collector metrics endpoint unavailable')
  const lines = (await response.text()).split('\n')
  missingMetrics = requiredMetrics.filter(
    (name) => !lines.some((line) => line.startsWith(name + '{') || line.startsWith(name + ' ')),
  )
  if (missingMetrics.length === 0) break
  await delay(500)
}
assert.deepEqual(missingMetrics, [], 'Required committed-result metrics were not exported')
process.stdout.write(
  `Verified real API → PostgreSQL → Service Bus → worker → private Azurite, retries, budgets, immutable replay/requeue, cancellation, Tempo and metrics.\nSignature execution: ${transient}\nTrace: ${traceId}\n`,
)
