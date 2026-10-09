export interface LocalConfig {
  readonly databaseUrl: string
  readonly serviceBusConnection: string
  readonly storageConnection: string
  readonly apiPort: number
  readonly concurrency: number
  readonly telemetryEndpoint: string
}
export interface AzureConfig {
  readonly mode: 'azure'
  readonly databaseUrl: string
  readonly serviceBusNamespace: string
  readonly blobEndpoint: string
  readonly identityClientId: string
  readonly apiPort: number
  readonly concurrency: number
  readonly telemetryEndpoint: string
}
export function readAzureConfig(env: NodeJS.ProcessEnv = process.env): AzureConfig {
  if (env.AFR_RUNTIME !== 'azure' || env.AFR_PUBLIC_DEMO !== 'true')
    throw new Error('Azure runtime requires explicit public mock demo configuration')
  if (env.SAPIOM_ENABLED !== 'false' || env.SAPIOM_API_KEY)
    throw new Error('Azure public demo requires paid providers disabled and no credentials')
  const database = new URL(env.DATABASE_URL ?? '')
  if (
    !['postgresql:', 'postgres:'].includes(database.protocol) ||
    !/^[a-z0-9-]+\.postgres\.database\.azure\.com$/.test(database.hostname) ||
    database.searchParams.get('sslmode') !== 'require' ||
    database.searchParams.get('sslaccept') !== 'strict'
  )
    throw new Error('Azure PostgreSQL requires its Azure endpoint and TLS')
  const namespace = env.AZURE_SERVICE_BUS_NAMESPACE ?? ''
  const endpoint = new URL(env.AZURE_BLOB_ENDPOINT ?? '')
  if (!/^[a-z0-9-]+\.servicebus\.windows\.net$/.test(namespace))
    throw new Error('Invalid Azure Service Bus namespace')
  if (
    endpoint.protocol !== 'https:' ||
    !/^[a-z0-9]+\.blob\.core\.windows\.net$/.test(endpoint.hostname) ||
    endpoint.pathname !== '/' ||
    endpoint.search ||
    endpoint.username ||
    endpoint.password
  )
    throw new Error('Invalid private Azure Blob endpoint')
  if (!/^[a-f0-9-]{36}$/i.test(env.AZURE_CLIENT_ID ?? ''))
    throw new Error('Azure runtime requires a user-assigned managed identity')
  const integer = (name: string, fallback: number, max: number): number => {
    const value = env[name] === undefined ? fallback : Number(env[name])
    if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}`)
    return value
  }
  return {
    mode: 'azure',
    databaseUrl: database.toString(),
    serviceBusNamespace: namespace,
    blobEndpoint: endpoint.toString(),
    identityClientId: env.AZURE_CLIENT_ID!,
    apiPort: integer(env.PORT === undefined ? 'API_PORT' : 'PORT', 3000, 65535),
    concurrency: integer('WORKER_CONCURRENCY', 2, 5),
    telemetryEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',
  }
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
