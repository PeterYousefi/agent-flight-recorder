import { createRuntime } from '@afr/runtime'
import { log } from '@afr/observability'

/** Scheduled cloud job recovers durable work even while HTTP/queue replicas are at zero. */
async function main(): Promise<void> {
  if (process.env.AFR_RUNTIME !== 'azure') throw new Error('Cloud dispatcher requires Azure mode')
  const runtime = await createRuntime('worker')
  try {
    await runtime.orchestrator.recoverPending()
    await runtime.dispatcher.dispatch()
  } finally {
    await runtime.close()
  }
}
void main().catch(() => {
  log('dispatcher.failed', { status: 'unavailable' })
  process.exitCode = 1
})
