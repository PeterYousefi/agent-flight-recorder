import {
  createExecution,
  createExecutionRequest,
  createMessageEnvelope,
  canTransitionTo,
  ExecutionStatus,
  ExecutionEventType,
  type Execution,
  type ExecutionStore,
} from '@afr/domain'
import { ApplicationError } from './errors.js'
import {
  append,
  providerRequest,
  type ProviderRegistry,
  systemRuntime,
  type Runtime,
} from './runtime.js'

export class ExecutionOrchestrator {
  public constructor(
    private readonly store: ExecutionStore,
    private readonly providers: ProviderRegistry,
    private readonly runtime: Runtime = systemRuntime,
  ) {}
  public async create(value: unknown): Promise<{ execution: Execution; created: boolean }> {
    const request = createExecutionRequest(value)
    const execution = createExecution(this.runtime.id(), request, this.runtime.now())
    const validation = await this.providers
      .get(request.provider)
      .validateRequest(providerRequest(execution, 1))
    if (!validation.valid)
      throw new ApplicationError('INVALID_REQUEST', 'Provider rejected the execution request')
    const result = await this.store.createExecutionIdempotently(execution)
    await this.queue(result.execution.id)
    const snapshot = await this.store.getExecution(result.execution.id)
    if (snapshot === undefined) throw new ApplicationError('NOT_FOUND', 'Execution is missing')
    return { ...result, execution: snapshot }
  }
  public async queue(id: string): Promise<void> {
    await this.store.transaction(id, async (tx) => {
      const execution = await tx.getExecution(id)
      if (execution === undefined) throw new ApplicationError('NOT_FOUND', 'Execution is missing')
      if (execution.status !== ExecutionStatus.PENDING) return
      await append(
        tx,
        id,
        ExecutionEventType.EXECUTION_QUEUED,
        { queueName: 'executions' },
        this.runtime,
      )
      await tx.updateExecutionSnapshot(
        id,
        ExecutionStatus.PENDING,
        ExecutionStatus.QUEUED,
        this.runtime.now(),
      )
      const messageId = this.runtime.id()
      await tx.createOutbox({
        id: messageId,
        executionId: id,
        availableAt: this.runtime.now(),
        message: createMessageEnvelope({
          messageId,
          ...this.runtime.traceContext?.(),
          messageType: 'execution.process',
          executionId: id,
          schemaVersion: 1,
          createdAt: this.runtime.now().toISOString(),
          payload: { attemptNumber: 1 },
        }),
      })
    })
  }
  public async recoverPending(): Promise<number> {
    const pending = await this.store.listExecutions({ status: ExecutionStatus.PENDING, limit: 100 })
    let recovered = 0
    for (const execution of pending) {
      // Legacy or manually inserted snapshots without a creation fact are not
      // safe to schedule. Normal creation commits that fact atomically.
      if ((await this.store.listEvents(execution.id)).length === 0) continue
      await this.queue(execution.id)
      recovered += 1
    }
    return recovered
  }
  public async cancel(id: string): Promise<Execution> {
    return this.store.transaction(id, async (tx) => {
      const execution = await tx.getExecution(id)
      if (execution === undefined) throw new ApplicationError('NOT_FOUND', 'Execution is missing')
      if (execution.status === ExecutionStatus.CANCELLED) return execution
      if (!canTransitionTo(execution.status, ExecutionStatus.CANCELLED))
        throw new ApplicationError('CONFLICT', 'Execution is already terminal')
      await append(
        tx,
        id,
        ExecutionEventType.EXECUTION_CANCELLED,
        { reason: 'Operator requested cancellation' },
        this.runtime,
      )
      const result = await tx.updateExecutionSnapshot(
        id,
        execution.status,
        ExecutionStatus.CANCELLED,
        this.runtime.now(),
      )
      await tx.createAuditRecord({
        id: this.runtime.id(),
        executionId: id,
        action: 'execution.cancelled',
        timestamp: this.runtime.now(),
      })
      return result
    })
  }
}
