import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createMessageEnvelope, type ArtifactReference, type JsonObject } from '@afr/domain'
import { InMemoryMessageBus, InMemoryArtifactStore } from './index.js'
function message(): ReturnType<typeof createMessageEnvelope<JsonObject>> {
  return createMessageEnvelope({
    messageId: 'message-1',
    messageType: 'execution.process',
    executionId: 'execution-1',
    schemaVersion: 1,
    createdAt: '2026-10-07T17:00:00Z',
    payload: { scenario: 'success' },
  })
}
describe('in-memory message bus', () => {
  it('buffers before subscription, acknowledges and permits duplicate deliveries', async () => {
    const bus = new InMemoryMessageBus()
    await bus.publish(message())
    expect(await bus.drain()).toBe(0)
    const ids: string[] = []
    await bus.subscribe((m) => {
      ids.push(m.messageId)
      return { kind: 'ACK' }
    })
    await bus.publish(message())
    expect(await bus.drain()).toBe(2)
    expect(ids).toEqual(['message-1', 'message-1'])
    expect(bus.queueDepth).toBe(0)
  })
  it('retries with injected time and dead-letters after bounded deliveries', async () => {
    let now = 0
    const bus = new InMemoryMessageBus({ now: () => now, maxDeliveries: 2, retryDelayMs: 100 })
    await bus.subscribe(() => ({ kind: 'RETRY', reason: 'transient' }))
    await bus.publish(message())
    expect(await bus.drain()).toBe(1)
    expect(await bus.drain()).toBe(0)
    now = 100
    expect(await bus.drain()).toBe(1)
    expect(bus.deadLetters).toHaveLength(1)
    expect(bus.queueDepth).toBe(0)
  })
  it('translates handler exceptions to bounded retry and supports explicit dead-letter', async () => {
    let now = 0
    const bus = new InMemoryMessageBus({ now: () => now, retryDelayMs: 1 })
    let deliveries = 0
    await bus.subscribe(() => {
      if (++deliveries === 1) throw new Error('test')
      return { kind: 'DEAD_LETTER', reason: 'invalid' }
    })
    await bus.publish(message())
    await bus.drain()
    now = 1
    await bus.drain()
    expect(bus.deadLetters[0]?.reason).toBe('invalid')
  })
  it('clones publications and redeliveries to prevent handler mutation', async () => {
    let now = 0
    const bus = new InMemoryMessageBus({ now: () => now, retryDelayMs: 1 })
    const payloads: unknown[] = []
    let delivered = 0
    await bus.subscribe<JsonObject>((m) => {
      payloads.push({ ...m.payload })
      ;(m.payload as Record<string, unknown>).scenario = 'changed'
      return ++delivered === 1 ? { kind: 'RETRY', reason: 'test' } : { kind: 'ACK' }
    })
    await bus.publish(message())
    await bus.drain()
    now = 1
    await bus.drain()
    expect(payloads).toEqual([{ scenario: 'success' }, { scenario: 'success' }])
  })
  it('subscription close preserves queued messages and permits a new consumer', async () => {
    const bus = new InMemoryMessageBus()
    const subscription = await bus.subscribe(() => ({ kind: 'ACK' }))
    await subscription.close()
    await bus.publish(message())
    expect(await bus.drain()).toBe(0)
    await bus.subscribe(() => ({ kind: 'ACK' }))
    expect(await bus.drain()).toBe(1)
    await bus.close()
    await expect(bus.publish(message())).rejects.toMatchObject({ code: 'CLOSED' })
    await expect(bus.subscribe(() => ({ kind: 'ACK' }))).rejects.toMatchObject({ code: 'CLOSED' })
  })
  it('shutdown waits for active delivery without losing pending retry', async () => {
    const bus = new InMemoryMessageBus()
    let release: () => void = () => {}
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    await bus.subscribe(async () => {
      await barrier
      return { kind: 'RETRY', reason: 'test' }
    })
    await bus.publish(message())
    const drain = bus.drain()
    let closed = false
    const closing = bus.close().then(() => {
      closed = true
    })
    expect(closed).toBe(false)
    release()
    await Promise.all([drain, closing])
    expect(closed).toBe(true)
    expect(bus.queueDepth).toBe(1)
  })
})
describe('in-memory artifact store', () => {
  const input = {
    executionId: 'execution-1',
    kind: 'provider_output' as const,
    content: { text: 'héllo' },
    contentType: 'application/json',
  }
  it('stores isolated JSON with exact byte size, checksum and deterministic metadata', async () => {
    const store = new InMemoryArtifactStore({
      id: () => 'artifact-1',
      now: () => new Date('2026-10-07T17:00:00Z'),
    })
    const reference = await store.put(input)
    const metadata = await store.metadata(reference)
    expect(metadata.sizeBytes).toBe(Buffer.byteLength(JSON.stringify(input.content)))
    expect(metadata.checksum).toBe(
      createHash('sha256').update(JSON.stringify(input.content)).digest('hex'),
    )
    const first = await store.get(reference)
    ;(first.content as Record<string, unknown>).text = 'mutated'
    expect((await store.get(reference)).content).toEqual(input.content)
    await store.delete(reference)
    await expect(store.get(reference)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('checks ownership, kind, supplied checksum and size', async () => {
    const store = new InMemoryArtifactStore({ maxSizeBytes: 100 })
    const reference = await store.put(input)
    await expect(store.get({ ...reference, executionId: 'another' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(store.get({ ...reference, kind: 'report' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(store.put({ ...input, checksum: 'incorrect' })).rejects.toMatchObject({
      code: 'CHECKSUM_MISMATCH',
    })
    await expect(store.put({ ...input, content: 'x'.repeat(100) })).rejects.toMatchObject({
      code: 'TOO_LARGE',
    })
    await expect(
      store.get({ ...reference, artifactId: 'missing' } as ArtifactReference),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
