import {
  createExecutionAttempt,
  ExecutionStatus,
  AttemptStatus,
  ExecutionEventType,
  type ExecutionStore,
  type Execution,
  type ExecutionAttempt,
} from '@afr/domain'
import { append, type Runtime } from './runtime.js'
export interface Claim {
  execution: Execution
  attempt: ExecutionAttempt
}
export async function claimExecution(
  store: ExecutionStore,
  id: string,
  runtime: Runtime,
  leaseMs: number,
): Promise<Claim | 'busy' | undefined> {
  return store.transaction(id, async (tx) => {
    const execution = await tx.getExecution(id)
    if (execution === undefined) return undefined
    const attempts = await tx.listAttempts(id)
    if (execution.status === ExecutionStatus.RUNNING) {
      const active = attempts.at(-1)
      if (
        active?.status === AttemptStatus.RUNNING &&
        (active.leaseExpiresAt?.getTime() ?? Infinity) > runtime.now().getTime()
      )
        return 'busy'
      // A crashed attempt is fenced out by its finished status. External side
      // effects can still repeat unless the provider honors its idempotency key.
      if (active?.status === AttemptStatus.RUNNING)
        await tx.finishAttempt({
          ...active,
          status: AttemptStatus.FAILED,
          completedAt: runtime.now(),
          errorCode: 'WORKER_LEASE_EXPIRED',
          errorMessage: 'Worker lease expired',
          retryable: true,
        })
      await append(
        tx,
        id,
        ExecutionEventType.EXECUTION_RETRY_SCHEDULED,
        {
          attemptNumber: attempts.length,
          reason: 'Worker lease expired',
          retryable: true,
          nextRetryAt: runtime.now().toISOString(),
        },
        runtime,
      )
      await tx.updateExecutionSnapshot(
        id,
        ExecutionStatus.RUNNING,
        ExecutionStatus.RETRY_SCHEDULED,
        runtime.now(),
      )
      await append(
        tx,
        id,
        ExecutionEventType.EXECUTION_QUEUED,
        { queueName: 'executions' },
        runtime,
      )
      await tx.updateExecutionSnapshot(
        id,
        ExecutionStatus.RETRY_SCHEDULED,
        ExecutionStatus.QUEUED,
        runtime.now(),
      )
    } else if (execution.status !== ExecutionStatus.QUEUED) return undefined
    const attempt = createExecutionAttempt({
      id: runtime.id(),
      executionId: id,
      attemptNumber: attempts.length + 1,
      status: AttemptStatus.RUNNING,
      startedAt: runtime.now(),
      leaseExpiresAt: new Date(runtime.now().getTime() + leaseMs),
    })
    await tx.createAttempt(attempt)
    await append(
      tx,
      id,
      ExecutionEventType.EXECUTION_STARTED,
      { attemptNumber: attempt.attemptNumber },
      runtime,
    )
    const running = await tx.updateExecutionSnapshot(
      id,
      ExecutionStatus.QUEUED,
      ExecutionStatus.RUNNING,
      runtime.now(),
    )
    return { execution: running, attempt }
  })
}
