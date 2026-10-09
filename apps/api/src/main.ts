import { createRuntime, startDispatcher } from '@afr/runtime'
import { log, traced } from '@afr/observability'
import { createApi } from './server.js'
import { fileURLToPath } from 'node:url'
async function main(): Promise<void> {
  const publicDemo = process.env.AFR_PUBLIC_DEMO === 'true'
  if (publicDemo && process.env.SAPIOM_ENABLED === 'true')
    throw new Error('Public demo requires paid providers to be disabled')
  if (
    process.env.AFR_PUBLIC_DEMO !== undefined &&
    !['true', 'false'].includes(process.env.AFR_PUBLIC_DEMO)
  )
    throw new Error('Invalid public demo configuration')
  const origin =
    process.env.AFR_PUBLIC_ORIGIN ??
    (process.env.AFR_RUNTIME === 'azure' &&
    process.env.CONTAINER_APP_NAME &&
    process.env.CONTAINER_APP_ENV_DNS_SUFFIX
      ? `https://${process.env.CONTAINER_APP_NAME}.${process.env.CONTAINER_APP_ENV_DNS_SUFFIX}`
      : undefined)
  if (
    publicDemo &&
    (!origin || new URL(origin).protocol !== 'https:' || new URL(origin).origin !== origin)
  )
    throw new Error('Public demo requires an exact HTTPS origin')
  const runtime = await createRuntime('api')
  const embeddedWorker =
    process.env.AFR_EMBEDDED_WORKER === 'true'
      ? await runtime.bus
          .subscribe(
            (message) =>
              traced('worker.process', { 'execution.id': message.executionId }, () =>
                runtime.processor.handle(message),
              ),
            { maxConcurrentMessages: runtime.config.concurrency },
          )
          .catch(async (error: unknown) => {
            await runtime.close()
            throw error
          })
      : undefined
  const api = await createApi(runtime, {
    publicDemo,
    ...(origin === undefined ? {} : { publicOrigin: origin }),
    ...(process.env.AFR_SERVE_WEB === 'true'
      ? {
          staticWebRoot:
            process.env.AFR_WEB_ROOT ?? fileURLToPath(new URL('../../web/dist', import.meta.url)),
        }
      : {}),
  }).catch(async (error: unknown) => {
    await embeddedWorker?.close()
    await runtime.close()
    throw error
  })
  const pump = startDispatcher(runtime.dispatcher, runtime.orchestrator)
  try {
    await api.listen({ host: publicDemo ? '0.0.0.0' : '127.0.0.1', port: runtime.config.apiPort })
  } catch (error) {
    await embeddedWorker?.close()
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
    await embeddedWorker?.close()
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
