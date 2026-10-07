import type { ExecutionStore, MessageBus } from '@afr/domain'
import { type Runtime, systemRuntime } from './runtime.js'

export class OutboxDispatcher {
  public constructor(
    private readonly store: ExecutionStore,
    private readonly bus: MessageBus,
    private readonly runtime: Runtime = systemRuntime,
  ) {}
  public async dispatch(limit = 50): Promise<number> {
    const pending = await this.store.listPendingOutbox(this.runtime.now(), limit)
    for (const record of pending) {
      // Mark only after transport acceptance. A crash in between republishes;
      // consumers must tolerate duplicate delivery, including across dispatchers.
      await this.bus.publish(record.message)
      await this.store.markOutboxPublished(record.id, this.runtime.now())
    }
    return pending.length
  }
}
