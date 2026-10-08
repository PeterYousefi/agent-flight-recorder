import { randomUUID } from 'node:crypto'
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
  ExecutionMetrics,
  correlation,
  traceContext,
  observeBus,
  observeProvider,
  observeArtifacts,
  log,
} from '@afr/observability'
import { readConfig } from './config.js'
export { readConfig, type LocalConfig } from './config.js'

export async function createLocalRuntime(service: 'api' | 'worker'): Promise<{
  config: ReturnType<typeof readConfig>
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
  const config = readConfig()
  const telemetry = startTelemetry(`afr-${service}`, config.telemetryEndpoint)
  const metrics = new ExecutionMetrics()
  const database = connectPostgres(config.databaseUrl, {
    correlation,
    committed: (facts, costs) => metrics.committed(facts, costs),
  })
  const transport = new AzureServiceBus(config.serviceBusConnection)
  const storage = new AzuriteArtifactStore(config.storageConnection)
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
          safe(() => probe('http://localhost:3200/ready')),
          safe(() => probe('http://localhost:9090/-/ready')),
          safe(() => probe('http://localhost:3001/api/health')),
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
          infrastructure: { postgres, serviceBus, azurite, tempo, prometheus, grafana },
          workerConcurrency: config.concurrency,
          queueDepth: null,
          queueDepthReason: 'Service Bus emulator SDK counter unavailable',
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
