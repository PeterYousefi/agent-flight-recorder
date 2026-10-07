import { randomUUID } from 'node:crypto'
import { BlobServiceClient } from '@azure/storage-blob'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AzuriteArtifactStore } from './azurite-artifact-store.js'
const name = `afr-test-${randomUUID()}`
const connection = 'UseDevelopmentStorage=true'
const store = new AzuriteArtifactStore(connection, name, 128)
const client = BlobServiceClient.fromConnectionString(connection).getContainerClient(name)
describe.skipIf(process.env.RUN_LOCAL_AZURE_TESTS !== 'true')('private Azurite artifacts', () => {
  beforeAll(async () => store.initialize())
  afterAll(async () => {
    await client.deleteIfExists()
  })
  it('round-trips UTF-8 JSON with metadata, checksum and private access', async () => {
    const content = { message: 'flight ✈️', ok: true }
    const reference = await store.put({
      executionId: randomUUID(),
      kind: 'provider_output',
      content,
      contentType: 'application/json',
    })
    const artifact = await store.get(reference)
    expect(artifact.content).toEqual(content)
    expect(artifact.sizeBytes).toBe(Buffer.byteLength(JSON.stringify(content)))
    expect(artifact.checksum).toMatch(/^[a-f0-9]{64}$/)
    const { content: _ignored, ...metadata } = artifact
    expect(await store.metadata(reference)).toEqual(metadata)
  })
  it('enforces execution ownership, missing behavior and opaque keys', async () => {
    const reference = await store.put({
      executionId: randomUUID(),
      kind: 'report',
      content: {},
      contentType: 'application/json',
    })
    await expect(store.get({ ...reference, executionId: randomUUID() })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(store.get({ ...reference, artifactId: '../path' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await store.delete(reference)
    await expect(store.get(reference)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('rejects oversized writes, supplied checksum mismatch and corrupted blobs', async () => {
    const input = {
      executionId: randomUUID(),
      kind: 'report' as const,
      contentType: 'application/json',
    }
    await expect(store.put({ ...input, content: 'x'.repeat(128) })).rejects.toMatchObject({
      code: 'TOO_LARGE',
    })
    await expect(store.put({ ...input, content: {}, checksum: 'bad' })).rejects.toMatchObject({
      code: 'CHECKSUM_MISMATCH',
    })
    const reference = await store.put({ ...input, content: { x: 1 } })
    const metadata = (await client.getBlobClient(reference.artifactId).getProperties()).metadata!
    await client
      .getBlockBlobClient(reference.artifactId)
      .uploadData(Buffer.from('{"x":2}'), { metadata })
    await expect(store.get(reference)).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' })
  })
  it('does not permit anonymous blob access and reports readiness', async () => {
    const reference = await store.put({
      executionId: randomUUID(),
      kind: 'report',
      content: {},
      contentType: 'application/json',
    })
    expect((await fetch(client.getBlobClient(reference.artifactId).url)).ok).toBe(false)
    expect(await store.healthCheck()).toBe(true)
  })
})
