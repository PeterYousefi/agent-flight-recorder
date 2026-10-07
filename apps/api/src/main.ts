import { createLocalRuntime, startDispatcher } from '@afr/runtime'
import { log } from '@afr/observability'
import { createApi } from './server.js'
async function main(): Promise<void> {
  const runtime = await createLocalRuntime('api')
  const api = await createApi(runtime)
  const pump = startDispatcher(runtime.dispatcher, runtime.orchestrator)
  try {
    await api.listen({ host: '127.0.0.1', port: runtime.config.apiPort })
  } catch (error) {
    await pump.close()
    await api.close()
    await runtime.close()
    throw error
  }
  log('api.ready', { status: 'ready' })
  let closing = false
  const close = async (): Promise<void> => {
    if (closing) return
    closing = true
    await api.close()
    await pump.close()
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
  log('api.start_failed', { status: 'unavailable' })
  process.exitCode = 1
})
