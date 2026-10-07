import type { MessageBus, Subscription } from '@afr/domain'
import type { ExecutionProcessor } from '@afr/application'

/** Process composition owns the transport; shutdown drains active handlers. */
export async function startWorker(
  bus: MessageBus,
  processor: ExecutionProcessor,
  concurrency = 5,
): Promise<Subscription> {
  return bus.subscribe((message) => processor.handle(message), {
    consumerName: 'afr-worker',
    maxConcurrentMessages: concurrency,
  })
}
