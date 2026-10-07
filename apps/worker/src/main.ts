import { createLocalRuntime } from '@afr/runtime'
import { traced, log } from '@afr/observability'
async function main(): Promise<void> {
  const runtime = await createLocalRuntime('worker')
  const subscription = await runtime.bus.subscribe(
    (message) =>
      traced('worker.process', { 'execution.id': message.executionId }, () =>
        runtime.processor.handle(message),
      ),
    { maxConcurrentMessages: runtime.config.concurrency },
  )
  log('worker.ready', { status: 'ready' })
  let closing = false
  const close = async (): Promise<void> => {
    if (closing) return
    closing = true
    await subscription.close()
    await runtime.close()
  }
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void close().catch(() => {
        process.exitCode = 1
      })
    })
}
void main().catch(() => {
  log('worker.start_failed', { status: 'unavailable' })
  process.exitCode = 1
})
