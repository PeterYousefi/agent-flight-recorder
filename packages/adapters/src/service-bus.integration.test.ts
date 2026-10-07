import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { ServiceBusAdministrationClient, ServiceBusClient } from '@azure/service-bus'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMessageEnvelope } from '@afr/domain'
import { AzureServiceBus } from './service-bus.js'
const connection =
  'Endpoint=sb://localhost;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;'
const administration = new ServiceBusAdministrationClient(
  connection.replace('sb://localhost;', 'sb://localhost:5300;'),
  {
    retryOptions: { maxRetries: 0 },
  },
)
const queue = `afr-test-${randomUUID()}`
let bus: AzureServiceBus
const envelope = (): ReturnType<typeof createMessageEnvelope> =>
  createMessageEnvelope({
    messageId: randomUUID(),
    messageType: 'fixture',
    executionId: randomUUID(),
    correlationId: randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    payload: { fixture: true },
  })
async function until(check: () => Promise<boolean>): Promise<void> {
  for (let n = 0; n < 100; n++) {
    if (await check()) return
    await delay(100)
  }
  throw new Error('Emulator assertion timed out')
}
describe.skipIf(process.env.RUN_LOCAL_AZURE_TESTS !== 'true')(
  'official Service Bus emulator',
  () => {
    beforeAll(async () => {
      await administration.createQueue(queue, { maxDeliveryCount: 5 })
      bus = new AzureServiceBus(connection, queue, 10)
    }, 30000)
    afterAll(async () => {
      if (bus !== undefined) await bus.close()
      await administration.deleteQueue(queue)
    }, 30000)
    it('preserves correlation, abandons for redelivery, then completes', async () => {
      const sent = envelope()
      let calls = 0
      const subscription = await bus.subscribe(
        (message) => {
          expect(message).toEqual(sent)
          calls++
          return calls === 1 ? { kind: 'RETRY', reason: 'fixture' } : { kind: 'ACK' }
        },
        { maxConcurrentMessages: 1 },
      )
      await bus.publish(sent)
      await until(async () => calls >= 2)
      await delay(100)
      await subscription.close()
      const client = new ServiceBusClient(connection)
      const receiver = client.createReceiver(queue)
      try {
        expect(await receiver.receiveMessages(1, { maxWaitTimeInMs: 500 })).toHaveLength(0)
      } finally {
        await receiver.close()
        await client.close()
      }
      expect(calls).toBe(2)
    }, 20000)
    it('settles rejected messages in the transport dead-letter subqueue', async () => {
      const sent = envelope()
      const subscription = await bus.subscribe(() => ({
        kind: 'DEAD_LETTER',
        reason: 'fixture rejection',
      }))
      await bus.publish(sent)
      const client = new ServiceBusClient(connection)
      const receiver = client.createReceiver(queue, { subQueueType: 'deadLetter' })
      try {
        const messages = await receiver.receiveMessages(1, { maxWaitTimeInMs: 5000 })
        await subscription.close()
        expect(messages[0]?.body).toEqual(sent)
        await receiver.completeMessage(messages[0]!)
      } finally {
        await receiver.close()
        await client.close()
      }
    }, 20000)
    it('checks readiness and shuts down cleanly', async () => {
      expect(await bus.healthCheck()).toBe(true)
      await bus.close()
      await expect(bus.publish(envelope())).rejects.toMatchObject({ code: 'CLOSED' })
    })
  },
)
