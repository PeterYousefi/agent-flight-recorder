import {
  AttemptStatus,
  ExecutionStatus,
  ExecutionEventType,
  createMessageEnvelope,
  type ExecutionRepositories,
  type ProviderError,
} from '@afr/domain'
import { append, type Runtime } from './runtime.js'
import type { Claim } from './claim.js'
import { retryDelay, type RetryPolicy } from './retry.js'

export async function recordFailure(
  tx: ExecutionRepositories,
  claim: Claim,
  error: ProviderError,
  runtime: Runtime,
  policy: RetryPolicy,
): Promise<void> {
  const { execution, attempt } = claim
  const completedAt = runtime.now()
  const started = (await tx.listEvents(execution.id)).some(
    (e) =>
      e.eventType === ExecutionEventType.TOOL_STARTED && e.payload.toolInvocationId === attempt.id,
  )
  if (started)
    await append(
      tx,
      execution.id,
      ExecutionEventType.TOOL_FAILED,
      {
        toolInvocationId: attempt.id,
        durationMs: Math.max(0, completedAt.getTime() - attempt.startedAt.getTime()),
        error,
      },
      runtime,
    )
  await tx.finishAttempt({
    ...attempt,
    status: AttemptStatus.FAILED,
    completedAt,
    errorCode: error.code,
    errorMessage: error.message,
    retryable: error.retryable,
  })
  const delay = retryDelay(
    error,
    attempt.attemptNumber,
    policy,
    execution.request.budgetPolicy.maxAttempts,
  )
  if (delay !== undefined) {
    const availableAt = new Date(completedAt.getTime() + delay)
    await append(
      tx,
      execution.id,
      ExecutionEventType.EXECUTION_RETRY_SCHEDULED,
      {
        attemptNumber: attempt.attemptNumber,
        reason: error.code,
        retryable: true,
        nextRetryAt: availableAt.toISOString(),
      },
      runtime,
    )
    await tx.updateExecutionSnapshot(
      execution.id,
      ExecutionStatus.RUNNING,
      ExecutionStatus.RETRY_SCHEDULED,
      completedAt,
    )
    const id = runtime.id()
    await tx.createOutbox({
      id,
      executionId: execution.id,
      availableAt,
      message: createMessageEnvelope({
        messageId: id,
        messageType: 'execution.process',
        executionId: execution.id,
        schemaVersion: 1,
        createdAt: completedAt.toISOString(),
        payload: { attemptNumber: attempt.attemptNumber + 1 },
      }),
    })
    return
  }
  await append(
    tx,
    execution.id,
    ExecutionEventType.EXECUTION_FAILED,
    { attemptNumber: attempt.attemptNumber, error },
    runtime,
  )
  await tx.updateExecutionSnapshot(
    execution.id,
    ExecutionStatus.RUNNING,
    ExecutionStatus.FAILED,
    completedAt,
  )
}
