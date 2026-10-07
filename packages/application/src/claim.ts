import {
  createExecutionAttempt,
  ExecutionStatus,
  AttemptStatus,
  ExecutionEventType,
  ProviderFailureCategory,
  type ExecutionStore,
  type Execution,
  type ExecutionAttempt,
} from '@afr/domain'
import { append, type Runtime } from './runtime.js'
import { recordFailure } from './failure-recorder.js'
import type { RetryPolicy } from './retry.js'
export interface Claim {
  execution: Execution
  attempt: ExecutionAttempt
}
export async function claimExecution(
  store: ExecutionStore,
  id: string,
  runtime: Runtime,
  leaseMs: number,
  expectedAttempt: number,
  retryPolicy: RetryPolicy,
): Promise<Claim | 'busy' | undefined> {
  return store.transaction(id, async (tx) => {
    const execution = await tx.getExecution(id)
    if (execution === undefined) return undefined
    const attempts = await tx.listAttempts(id)
    if (execution.status === ExecutionStatus.RUNNING) {
      const active = attempts.at(-1)
      if (
        active?.status === AttemptStatus.RUNNING &&
        active.attemptNumber === expectedAttempt &&
        (active.leaseExpiresAt?.getTime() ?? Infinity) > runtime.now().getTime()
      )
        return 'busy'
      if (active === undefined || active.status !== AttemptStatus.RUNNING) return undefined
      if (active.attemptNumber !== expectedAttempt) return undefined
      await recordFailure(
        tx,
        { execution, attempt: active },
        {
          code: 'WORKER_LEASE_EXPIRED',
          message: 'Worker lease expired',
          retryable: true,
          category: ProviderFailureCategory.RETRYABLE,
        },
        runtime,
        retryPolicy,
      )
      return undefined
    } else if (
      execution.status !== ExecutionStatus.QUEUED ||
      expectedAttempt !== attempts.length + 1
    )
      return undefined
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
