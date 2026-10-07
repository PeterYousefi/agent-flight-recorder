import { describe, expect, it } from 'vitest'
import { readConfig } from './config.js'
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
