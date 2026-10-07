export interface LocalConfig {
  readonly databaseUrl: string
  readonly serviceBusConnection: string
  readonly storageConnection: string
  readonly apiPort: number
  readonly concurrency: number
  readonly telemetryEndpoint: string
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): LocalConfig {
  const databaseUrl =
    env.DATABASE_URL ?? 'postgresql://afr_user:afr_password@localhost:5434/agent_flight_recorder'
  const database = new URL(databaseUrl)
  if (
    !['postgresql:', 'postgres:'].includes(database.protocol) ||
    !['localhost', '127.0.0.1', 'postgres'].includes(database.hostname)
  )
    throw new Error('Local runtime requires local PostgreSQL')
  const serviceBusConnection =
    env.AZURE_SERVICE_BUS_CONNECTION_STRING ??
    'Endpoint=sb://localhost;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;'
  if (
    !/^Endpoint=sb:\/\/(localhost|127\.0\.0\.1|servicebus-emulator);/.test(serviceBusConnection) ||
    !serviceBusConnection.includes('UseDevelopmentEmulator=true;')
  )
    throw new Error('Local runtime requires the Service Bus emulator')
  const integer = (name: string, fallback: number, max: number): number => {
    const value = env[name] === undefined ? fallback : Number(env[name])
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}`)
    return value
  }
  if (env.SAPIOM_ENABLED !== undefined && !['true', 'false'].includes(env.SAPIOM_ENABLED))
    throw new Error('Invalid SAPIOM_ENABLED')
  if (env.SAPIOM_ENABLED === 'true' && !env.SAPIOM_API_KEY?.trim())
    throw new Error('Enabled Sapiom requires application credentials')
  return {
    databaseUrl,
    serviceBusConnection,
    storageConnection: env.AZURE_STORAGE_CONNECTION_STRING ?? 'UseDevelopmentStorage=true',
    apiPort: integer('API_PORT', 3000, 65535),
    concurrency: integer('WORKER_CONCURRENCY', 5, 100),
    telemetryEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',
  }
}
