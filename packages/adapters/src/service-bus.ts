import { setTimeout as delay } from 'node:timers/promises'
import { ServiceBusClient, type ServiceBusReceiver } from '@azure/service-bus'
import {
  createMessageEnvelope,
  type JsonValue,
  type MessageBus,
  type MessageEnvelope,
  type MessageHandler,
  type Subscription,
  type SubscriptionOptions,
} from '@afr/domain'
import { AdapterError } from './errors.js'

/** Peek-lock settlement; application retries are scheduled by the durable outbox. */
export class AzureServiceBus implements MessageBus {
  private readonly client: ServiceBusClient
  private readonly receivers = new Set<ServiceBusReceiver>()
  private readonly sender: ReturnType<ServiceBusClient['createSender']>
  private closed = false
  public constructor(
    connectionString: string,
    private readonly queueName = 'executions',
    private readonly retryDelayMs = 10000,
  ) {
    if (!connectionString.includes('UseDevelopmentEmulator=true'))
      throw new AdapterError('INVALID', 'This runtime requires the local Service Bus emulator')
    if (!Number.isInteger(retryDelayMs) || retryDelayMs < 10 || retryDelayMs > 30000)
      throw new AdapterError('INVALID', 'Invalid transport retry delay')
    this.client = new ServiceBusClient(connectionString, {
      retryOptions: { maxRetries: 3, timeoutInMs: 10000 },
    })
    this.sender = this.client.createSender(queueName)
  }
  public async publish<T extends JsonValue>(message: MessageEnvelope<T>): Promise<void> {
    if (this.closed) throw new AdapterError('CLOSED', 'Message bus is closed')
    const validated = createMessageEnvelope(message)
    await this.sender.sendMessages({
      body: validated,
      messageId: message.messageId,
      correlationId: message.correlationId ?? message.executionId,
      contentType: 'application/json',
      applicationProperties: {
        executionId: message.executionId,
        messageType: message.messageType,
        schemaVersion: message.schemaVersion,
      },
    })
  }
  public async subscribe<T extends JsonValue>(
    handler: MessageHandler<T>,
    options: SubscriptionOptions = {},
  ): Promise<Subscription> {
    if (this.closed) throw new AdapterError('CLOSED', 'Message bus is closed')
    const concurrency = options.maxConcurrentMessages ?? 5
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100)
      throw new AdapterError('INVALID', 'Invalid consumer concurrency')
    const receiver = this.client.createReceiver(this.queueName, {
      receiveMode: 'peekLock',
      maxAutoLockRenewalDurationInMs: 300000,
    })
    this.receivers.add(receiver)
    const subscription = receiver.subscribe(
      {
        processMessage: async (message) => {
          let envelope: MessageEnvelope<T>
          try {
            envelope = createMessageEnvelope(message.body as MessageEnvelope<T>)
          } catch {
            await receiver.deadLetterMessage(message, {
              deadLetterReason: 'INVALID_ENVELOPE',
              deadLetterErrorDescription: 'Envelope failed validation',
            })
            return
          }
          let result
          try {
            result = await handler(envelope)
          } catch {
            result = { kind: 'RETRY' as const, reason: 'Handler failed' }
          }
          if (result.kind === 'ACK') await receiver.completeMessage(message)
          else if (result.kind === 'DEAD_LETTER')
            await receiver.deadLetterMessage(message, {
              deadLetterReason: 'HANDLER_REJECTED',
              deadLetterErrorDescription: 'Message cannot be processed',
            })
          else {
            await delay(this.retryDelayMs)
            await receiver.abandonMessage(message)
          }
        },
        // Raw SDK exceptions may contain endpoints or connection details. The SDK
        // reconnects; health is checked separately and logged only as a safe status.
        processError: async () => {
          await Promise.resolve()
        },
      },
      { autoCompleteMessages: false, maxConcurrentCalls: concurrency },
    )
    return {
      close: async () => {
        await subscription.close()
        await receiver.close()
        this.receivers.delete(receiver)
      },
    }
  }
  public async healthCheck(): Promise<boolean> {
    if (this.closed) return false
    const receiver = this.client.createReceiver(this.queueName)
    try {
      await receiver.peekMessages(1, { abortSignal: AbortSignal.timeout(5000) })
      return true
    } catch {
      return false
    } finally {
      await receiver.close()
    }
  }
  public async close(): Promise<void> {
    this.closed = true
    await Promise.all([...this.receivers].map((receiver) => receiver.close()))
    this.receivers.clear()
    await this.sender.close()
    await this.client.close()
  }
}
