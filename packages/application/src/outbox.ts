import {
  ExecutionStatus,
  ExecutionEventType,
  type ExecutionStore,
  type MessageBus,
} from '@afr/domain'
import { append, type Runtime, systemRuntime } from './runtime.js'

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
      const publish = await this.store.transaction(record.executionId, async (tx) => {
        const execution = await tx.getExecution(record.executionId)
        if (execution === undefined) return false
        const expected = (await tx.listAttempts(record.executionId)).length + 1
        if (execution.status === ExecutionStatus.RETRY_SCHEDULED) {
          if (record.message.payload.attemptNumber !== expected) return false
          await append(
            tx,
            execution.id,
            ExecutionEventType.EXECUTION_QUEUED,
            { queueName: 'executions' },
            this.runtime,
          )
          await tx.updateExecutionSnapshot(
            execution.id,
            ExecutionStatus.RETRY_SCHEDULED,
            ExecutionStatus.QUEUED,
            this.runtime.now(),
          )
          return true
        }
        return (
          execution.status === ExecutionStatus.QUEUED &&
          record.message.payload.attemptNumber === expected
        )
      })
      if (publish) await this.bus.publish(record.message)
      await this.store.markOutboxPublished(record.id, this.runtime.now())
    }
    return pending.length
  }
}
