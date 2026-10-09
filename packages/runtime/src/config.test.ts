import { describe, expect, it } from 'vitest'
import { readConfig, readAzureConfig } from './config.js'
describe('local-only environment validation', () => {
  it('runs without Sapiom credentials or cloud connections', () => {
    const config = readConfig({})
    expect(config.databaseUrl).toContain('localhost')
    expect(config.serviceBusConnection).toContain('UseDevelopmentEmulator=true')
    expect(config.storageConnection).toBe('UseDevelopmentStorage=true')
  })
  it('rejects cloud database and messaging endpoints', () => {
    expect(() =>
      readConfig({ DATABASE_URL: 'postgresql://user:placeholder@cloud.example/db' }),
    ).toThrow('Local runtime')
    expect(() =>
      readConfig({
        AZURE_SERVICE_BUS_CONNECTION_STRING:
          'Endpoint=sb://cloud.example;UseDevelopmentEmulator=true;',
      }),
    ).toThrow('Local runtime')
  })
  it('rejects invalid concurrency and ports', () => {
    for (const value of ['0', '-1', 'NaN', '1.5', '101'])
      expect(() => readConfig({ WORKER_CONCURRENCY: value })).toThrow('Invalid WORKER_CONCURRENCY')
    expect(() => readConfig({ API_PORT: '65536' })).toThrow('Invalid API_PORT')
  })
  it('requires application credentials only when Sapiom is explicitly enabled', () => {
    expect(() => readConfig({ SAPIOM_ENABLED: 'true' })).toThrow('requires application credentials')
    expect(() => readConfig({ SAPIOM_ENABLED: 'yes' })).toThrow('Invalid SAPIOM_ENABLED')
    expect(() => readConfig({ SAPIOM_ENABLED: 'false' })).not.toThrow()
  })
})
describe('explicit Azure public sandbox configuration', () => {
  const env = {
    AFR_RUNTIME: 'azure',
    AFR_PUBLIC_DEMO: 'true',
    SAPIOM_ENABLED: 'false',
    DATABASE_URL:
      'postgresql://demo:placeholder@afr.postgres.database.azure.com/afr?sslmode=require&sslaccept=strict',
    AZURE_SERVICE_BUS_NAMESPACE: 'afr.servicebus.windows.net',
    AZURE_BLOB_ENDPOINT: 'https://afr.blob.core.windows.net',
    AZURE_CLIENT_ID: '11111111-1111-4111-8111-111111111111',
  }
  it('requires opt-in, TLS and managed identity while retaining local defaults', () => {
    expect(readAzureConfig(env).mode).toBe('azure')
    for (const override of [
      { AFR_RUNTIME: 'local' },
      { AFR_PUBLIC_DEMO: 'false' },
      { DATABASE_URL: env.DATABASE_URL.replace('sslmode=require', 'sslmode=disable') },
      { AZURE_SERVICE_BUS_NAMESPACE: 'attacker.example' },
      { AZURE_BLOB_ENDPOINT: 'https://attacker.example' },
      { AZURE_BLOB_ENDPOINT: 'https://afr.blob.core.windows.net/private' },
      { AZURE_CLIENT_ID: '' },
      { WORKER_CONCURRENCY: '100' },
    ])
      expect(() => readAzureConfig({ ...env, ...override })).toThrow()
  })
  it('forbids paid provider activation and credentials in public hosting', () => {
    expect(() => readAzureConfig({ ...env, SAPIOM_ENABLED: 'true' })).toThrow('paid providers')
    expect(() => readAzureConfig({ ...env, SAPIOM_API_KEY: 'placeholder' })).toThrow(
      'paid providers',
    )
  })
})
