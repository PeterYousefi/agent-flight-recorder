import { randomUUID } from 'node:crypto'
import { ManagedIdentityCredential } from '@azure/identity'
import { connectPostgres } from '@afr/persistence'
import { AzureServiceBus, AzuriteArtifactStore } from '@afr/adapters'
import { MockProvider, SapiomProvider } from '@afr/providers'
import {
  ExecutionOrchestrator,
  ExecutionProcessor,
  ProviderRegistry,
  ReplayService,
  DeadLetterService,
  OutboxDispatcher,
} from '@afr/application'
import {
  startTelemetry,
  startCloudTelemetry,
  ExecutionMetrics,
  correlation,
  traceContext,
  observeBus,
  observeProvider,
  observeArtifacts,
  log,
} from '@afr/observability'
import { readConfig, readAzureConfig } from './config.js'
export { readConfig, readAzureConfig, type LocalConfig, type AzureConfig } from './config.js'

export async function createRuntime(service: 'api' | 'worker'): Promise<{
  config: ReturnType<typeof readConfig> | ReturnType<typeof readAzureConfig>
  store: ReturnType<typeof connectPostgres>['store']
  orchestrator: ExecutionOrchestrator
  replay: ReplayService
  deadLetters: DeadLetterService
  artifacts: ReturnType<typeof observeArtifacts>
  bus: ReturnType<typeof observeBus>
  dispatcher: OutboxDispatcher
  processor: ExecutionProcessor
  operationalStatus: () => Promise<Record<string, unknown>>
  ready: () => Promise<boolean>
  close: () => Promise<void>
}> {
  if (
    process.env.AFR_RUNTIME !== undefined &&
    !['local', 'azure'].includes(process.env.AFR_RUNTIME)
  )
    throw new Error('Invalid AFR_RUNTIME')
  const cloud = process.env.AFR_RUNTIME === 'azure'
  const vmObservability = cloud && process.env.AFR_VM_OBSERVABILITY === 'true'
  const config = cloud ? readAzureConfig() : readConfig()
  const telemetry =
    cloud && !vmObservability
      ? startCloudTelemetry(`afr-${service}`)
      : startTelemetry(`afr-${service}`, config.telemetryEndpoint, cloud ? 'azure-demo' : 'local')
  const metrics = new ExecutionMetrics()
  const database = connectPostgres(config.databaseUrl, {
    correlation,
    committed: (facts, costs) => metrics.committed(facts, costs),
  })
  const credential =
    'mode' in config
      ? new ManagedIdentityCredential({ clientId: config.identityClientId })
      : undefined
  const transport = new AzureServiceBus(
    'mode' in config
      ? { namespace: config.serviceBusNamespace, credential: credential! }
      : config.serviceBusConnection,
  )
  const storage = new AzuriteArtifactStore(
    'mode' in config
      ? { endpoint: config.blobEndpoint, credential: credential! }
      : config.storageConnection,
  )
  const close = async (): Promise<void> => {
    await transport.close()
    await database.close()
    await telemetry.shutdown()
  }
  try {
    if (!(await database.healthCheck())) throw new Error('PostgreSQL unavailable')
    await storage.initialize()
    const bus = observeBus(transport)
    const artifacts = observeArtifacts(storage)
    const sapiom = new SapiomProvider()
    const providers = new ProviderRegistry([
      observeProvider(new MockProvider()),
      observeProvider(sapiom),
    ])
    const runtime = { now: () => new Date(), id: randomUUID, correlation, traceContext }
    const orchestrator = new ExecutionOrchestrator(database.store, providers, runtime)
    return {
      config,
      store: database.store,
      orchestrator,
      replay: new ReplayService(database.store, providers, orchestrator, runtime),
      deadLetters: new DeadLetterService(database.store, orchestrator, runtime),
      artifacts,
      bus,
      dispatcher: new OutboxDispatcher(database.store, bus, runtime),
      processor: new ExecutionProcessor(database.store, providers, artifacts, runtime),
      operationalStatus: async () => {
        const probe = async (url: string): Promise<boolean> => {
          try {
            return (await fetch(url, { signal: AbortSignal.timeout(2000), redirect: 'error' })).ok
          } catch {
            return false
          }
        }
        const safe = async (work: () => Promise<boolean>): Promise<string> =>
          (await work().catch(() => false)) ? 'ready' : 'unavailable'
        const [postgres, serviceBus, azurite, tempo, prometheus, grafana] = await Promise.all([
          safe(() => database.healthCheck()),
          safe(() => transport.healthCheck()),
          safe(() => storage.healthCheck()),
          cloud && !vmObservability
            ? Promise.resolve('not_configured')
            : safe(() =>
                probe(vmObservability ? 'http://tempo:3200/ready' : 'http://localhost:3200/ready'),
              ),
          cloud && !vmObservability
            ? Promise.resolve('not_configured')
            : safe(() =>
                probe(
                  vmObservability
                    ? 'http://prometheus:9090/-/ready'
                    : 'http://localhost:9090/-/ready',
                ),
              ),
          cloud && !vmObservability
            ? Promise.resolve('not_configured')
            : safe(() =>
                probe(
                  vmObservability
                    ? 'http://grafana:3000/grafana/api/health'
                    : 'http://localhost:3001/api/health',
                ),
              ),
        ])
        return {
          providers: [
            {
              name: 'mock',
              configured: true,
              status: 'healthy',
              costs: 'synthetic',
              capabilities: new MockProvider().capabilities,
            },
            {
              name: 'sapiom',
              configured: sapiom.configured,
              status: sapiom.configured ? 'configured_not_probed' : 'not_configured',
              capabilities: sapiom.capabilities,
            },
          ],
          infrastructure: {
            postgres,
            serviceBus,
            ...(cloud ? { blob: azurite } : { azurite }),
            tempo,
            prometheus,
            grafana,
          },
          workerConcurrency: config.concurrency,
          queueDepth: null,
          queueDepthReason: cloud
            ? 'Queue administration access is deliberately not granted'
            : 'Service Bus emulator SDK counter unavailable',
        }
      },
      ready: async () =>
        (
          await Promise.all([
            database.healthCheck(),
            transport.healthCheck(),
            storage.healthCheck(),
          ])
        ).every(Boolean),
      close,
    }
  } catch (error) {
    await close()
    throw error
  }
}
export async function createLocalRuntime(
  service: 'api' | 'worker',
): ReturnType<typeof createRuntime> {
  if (process.env.AFR_RUNTIME === 'azure') throw new Error('Local runtime cannot select Azure')
  return createRuntime(service)
}
export function startDispatcher(
  dispatcher: OutboxDispatcher,
  orchestrator: ExecutionOrchestrator,
): { close: () => Promise<void> } {
  let stopped = false
  let active: Promise<void> | undefined
  let lastRecovery = 0
  const tick = (): void => {
    if (active !== undefined || stopped) return
    active = (async () => {
      if (Date.now() - lastRecovery >= 10000) {
        await orchestrator.recoverPending()
        lastRecovery = Date.now()
      }
      await dispatcher.dispatch()
    })()
      .catch(() => {
        log('outbox.unavailable', { status: 'retrying' })
      })
      .finally(() => {
        active = undefined
      })
  }
  const timer = setInterval(tick, 250)
  tick()
  return {
    close: async () => {
      stopped = true
      clearInterval(timer)
      await active
    },
  }
}
