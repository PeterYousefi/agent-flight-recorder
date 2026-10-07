import {
  createExecution,
  createExecutionRequest,
  ExecutionStatus,
  ExecutionEventType,
  type ExecutionStore,
  type Execution,
} from '@afr/domain'
import { ApplicationError } from './errors.js'
import { append, type Runtime, systemRuntime } from './runtime.js'
import type { ExecutionOrchestrator } from './orchestrator.js'

export class DeadLetterService {
  public constructor(
    private readonly store: ExecutionStore,
    private readonly orchestrator: ExecutionOrchestrator,
    private readonly runtime: Runtime = systemRuntime,
  ) {}
  public async requeue(id: string): Promise<Execution> {
    const record = await this.store.getDeadLetter(id)
    if (record === undefined) throw new ApplicationError('NOT_FOUND', 'Dead letter is missing')
    const execution = await this.store.transaction(record.executionId, async (tx) => {
      const previous = await tx.getRequeuedExecutionId(id)
      if (previous !== undefined) {
        const existing = await tx.getExecution(previous)
        if (existing === undefined)
          throw new ApplicationError('NOT_FOUND', 'Requeued execution is missing')
        return existing
      }
      const original = await tx.getExecution(record.executionId)
      if (original?.status !== ExecutionStatus.DEAD_LETTERED)
        throw new ApplicationError('CONFLICT', 'Only a terminal dead letter can be requeued')
      const { idempotencyKey: _key, ...source } = original.request
      const request = createExecutionRequest(source)
      const created = await tx.createExecution(
        createExecution(this.runtime.id(), request, this.runtime.now(), {
          originalExecutionId: original.id,
        }),
      )
      await append(
        tx,
        created.id,
        ExecutionEventType.EXECUTION_CREATED,
        {
          agentId: request.agentId,
          provider: request.provider,
          operation: request.operation,
          budgetPolicy: request.budgetPolicy,
          originalExecutionId: original.id,
        },
        this.runtime,
      )
      await tx.createDeadLetterRequeue(this.runtime.id(), id, created.id, this.runtime.now())
      await tx.createAuditRecord({
        id: this.runtime.id(),
        executionId: created.id,
        action: 'dead_letter.requeued',
        timestamp: this.runtime.now(),
        metadata: { deadLetterId: id, originalExecutionId: original.id },
      })
      return created
    })
    await this.orchestrator.queue(execution.id)
    const queued = await this.store.getExecution(execution.id)
    if (queued === undefined)
      throw new ApplicationError('NOT_FOUND', 'Requeued execution is missing')
    return queued
  }
}
