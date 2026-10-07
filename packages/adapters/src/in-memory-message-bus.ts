import {
  createMessageEnvelope,
  type MessageBus,
  type MessageEnvelope,
  type MessageHandler,
  type JsonValue,
  type Subscription,
  type SubscriptionOptions,
  type MessageHandlingResult,
} from '@afr/domain'
import { AdapterError } from './errors.js'

interface Pending {
  message: MessageEnvelope<JsonValue>
  deliveries: number
  availableAt: number
}
export interface InMemoryBusOptions {
  readonly now?: () => number
  readonly maxDeliveries?: number
  readonly retryDelayMs?: number
}
export class InMemoryMessageBus implements MessageBus {
  private pending: Pending[] = []
  private handler: MessageHandler<JsonValue> | undefined
  private concurrency = 1
  private closed = false
  private draining: Promise<number> | undefined
  private readonly rejected: Array<{ message: MessageEnvelope<JsonValue>; reason: string }> = []
  private readonly now: () => number
  private readonly maxDeliveries: number
  private readonly retryDelayMs: number
  public constructor(options: InMemoryBusOptions = {}) {
    this.now = options.now ?? Date.now
    this.maxDeliveries = options.maxDeliveries ?? 10
    this.retryDelayMs = options.retryDelayMs ?? 1000
    if (
      !Number.isInteger(this.maxDeliveries) ||
      this.maxDeliveries < 1 ||
      !Number.isFinite(this.retryDelayMs) ||
      this.retryDelayMs < 1
    )
      throw new AdapterError('INVALID', 'Invalid delivery policy')
  }
  public async publish<T extends JsonValue>(message: MessageEnvelope<T>): Promise<void> {
    this.assertOpen()
    const validated = createMessageEnvelope(message)
    this.pending.push({
      message: structuredClone(validated),
      deliveries: 0,
      availableAt: this.now(),
    })
  }
  public async subscribe<T extends JsonValue>(
    handler: MessageHandler<T>,
    options: SubscriptionOptions = {},
  ): Promise<Subscription> {
    this.assertOpen()
    if (this.handler !== undefined)
      throw new AdapterError('INVALID', 'In-memory bus supports one active consumer')
    const concurrency = options.maxConcurrentMessages ?? 1
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100)
      throw new AdapterError('INVALID', 'Invalid consumer concurrency')
    this.concurrency = concurrency
    // The caller selects its payload type; runtime messages remain validated JSON.
    const registered: MessageHandler<JsonValue> = (message) =>
      handler(message as MessageEnvelope<T>)
    this.handler = registered
    return {
      close: async () => {
        if (this.handler === registered) this.handler = undefined
        await this.draining
      },
    }
  }
  // Explicit ticks make test ordering and time deterministic. Each tick delivers
  // only messages ready at its start; RETRY never creates a busy loop.
  public async drain(): Promise<number> {
    this.assertOpen()
    if (this.draining !== undefined) return this.draining
    const work = this.tick()
    this.draining = work
    try {
      return await work
    } finally {
      this.draining = undefined
    }
  }
  private async tick(): Promise<number> {
    const handler = this.handler
    if (handler === undefined) return 0
    const readyAt = this.now()
    const ready = this.pending.filter((item) => item.availableAt <= readyAt)
    this.pending = this.pending.filter((item) => item.availableAt > readyAt)
    let delivered = 0
    for (let index = 0; index < ready.length; index += this.concurrency) {
      if (this.closed || this.handler !== handler) {
        this.pending.push(...ready.slice(index))
        break
      }
      const batch = ready.slice(index, index + this.concurrency)
      await Promise.all(
        batch.map(async (item) => {
          item.deliveries += 1
          let result: MessageHandlingResult
          try {
            result = await handler(structuredClone(item.message))
          } catch {
            result = { kind: 'RETRY', reason: 'Consumer exception' }
          }
          if (result?.kind === 'ACK') return
          if (result?.kind === 'DEAD_LETTER') {
            this.rejected.push({ message: item.message, reason: result.reason })
            return
          }
          if (item.deliveries >= this.maxDeliveries) {
            this.rejected.push({ message: item.message, reason: 'Maximum delivery count exceeded' })
            return
          }
          item.availableAt = this.now() + this.retryDelayMs
          this.pending.push(item)
        }),
      )
      delivered += batch.length
    }
    return delivered
  }
  public get queueDepth(): number {
    return this.pending.length
  }
  public get deadLetters(): readonly { message: MessageEnvelope<JsonValue>; reason: string }[] {
    return structuredClone(this.rejected)
  }
  public async close(): Promise<void> {
    this.closed = true
    this.handler = undefined
    await this.draining
  }
  private assertOpen(): void {
    if (this.closed) throw new AdapterError('CLOSED', 'Message bus is closed')
  }
}
