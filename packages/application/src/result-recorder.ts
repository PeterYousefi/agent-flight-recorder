import {
  createNonNegativeMoney,
  ExecutionStatus,
  AttemptStatus,
  ExecutionEventType,
  canContinueDuration,
  canSpend,
  type ExecutionStore,
  type ArtifactStore,
  type ProviderExecutionResult,
} from '@afr/domain'
import { append, type Runtime } from './runtime.js'
import { executionUsage } from './budgets.js'
import { budgetExceeded } from './budget-effects.js'
import type { Claim } from './claim.js'
export async function finishExecution(
  store: ExecutionStore,
  artifacts: ArtifactStore,
  claim: Claim,
  result: ProviderExecutionResult,
  runtime: Runtime,
): Promise<void> {
  const { execution, attempt } = claim
  let artifact: Awaited<ReturnType<ArtifactStore['get']>> | undefined
  if (
    result.kind === 'SUCCEEDED' &&
    (await store.getExecution(execution.id))?.status === ExecutionStatus.RUNNING
  ) {
    const reference = await artifacts.put({
      executionId: execution.id,
      kind: 'provider_output',
      content: result.output,
      contentType: 'application/json',
    })
    artifact = await artifacts.get(reference)
  }
  await store.transaction(execution.id, async (tx) => {
    const current = await tx.getExecution(execution.id)
    const active = (await tx.listAttempts(execution.id)).find((a) => a.id === attempt.id)
    if (active?.status !== AttemptStatus.RUNNING) return
    const completedAt = runtime.now()
    if (result.cost?.measured !== undefined) {
      const measured = createNonNegativeMoney(result.cost.measured.amountUsd)
      await tx.recordCost({
        id: runtime.id(),
        executionId: execution.id,
        attemptId: attempt.id,
        category: 'provider',
        kind: 'measured',
        amountMicroUsd: BigInt(Math.round(measured.amountUsd * 1_000_000)),
        timestamp: completedAt,
      })
    }
    if (current?.status === ExecutionStatus.CANCELLED) {
      await tx.finishAttempt({ ...attempt, status: AttemptStatus.CANCELLED, completedAt })
      await tx.createAuditRecord({
        id: runtime.id(),
        executionId: execution.id,
        action: 'execution.late_result_discarded',
        timestamp: completedAt,
      })
      return
    }
    if (current?.status !== ExecutionStatus.RUNNING) return
    const durationMs = Math.max(0, completedAt.getTime() - attempt.startedAt.getTime())
    if (result.kind === 'FAILED') {
      await append(
        tx,
        execution.id,
        ExecutionEventType.TOOL_FAILED,
        { toolInvocationId: attempt.id, durationMs, error: result.error },
        runtime,
      )
      await tx.finishAttempt({
        ...attempt,
        status: AttemptStatus.FAILED,
        completedAt,
        errorCode: result.error.code,
        errorMessage: result.error.message,
        retryable: result.error.retryable,
      })
      await append(
        tx,
        execution.id,
        ExecutionEventType.EXECUTION_FAILED,
        { attemptNumber: attempt.attemptNumber, error: result.error },
        runtime,
      )
      await tx.updateExecutionSnapshot(
        execution.id,
        ExecutionStatus.RUNNING,
        ExecutionStatus.FAILED,
        completedAt,
      )
      return
    }
    if (artifact !== undefined) {
      await tx.recordArtifact({
        id: artifact.artifactId,
        executionId: execution.id,
        kind: artifact.kind,
        contentType: artifact.contentType,
        sizeBytes: BigInt(artifact.sizeBytes),
        storageKey: artifact.artifactId,
        createdAt: new Date(artifact.createdAt),
        ...(artifact.checksum === undefined ? {} : { checksum: artifact.checksum }),
      })
      await append(
        tx,
        execution.id,
        ExecutionEventType.ARTIFACT_PERSISTED,
        {
          artifactReference: artifact.artifactId,
          artifactType: artifact.kind,
          sizeBytes: artifact.sizeBytes,
        },
        runtime,
      )
    }
    await append(
      tx,
      execution.id,
      ExecutionEventType.TOOL_SUCCEEDED,
      {
        toolInvocationId: attempt.id,
        durationMs,
        ...(artifact === undefined ? {} : { artifactReference: artifact.artifactId }),
      },
      runtime,
    )
    const usage = await executionUsage(tx, current, completedAt)
    const budget = [
      canContinueDuration(current.request.budgetPolicy, usage),
      canSpend(current.request.budgetPolicy, usage, { estimatedAdditionalCostUsd: 0 }),
    ].find((d) => d.kind === 'DENY')
    if (budget?.kind === 'DENY') {
      await budgetExceeded(tx, claim, budget.observation, runtime)
      return
    }
    await tx.finishAttempt({ ...attempt, status: AttemptStatus.SUCCEEDED, completedAt })
    await append(
      tx,
      execution.id,
      ExecutionEventType.EXECUTION_SUCCEEDED,
      {
        attemptNumber: attempt.attemptNumber,
        ...(result.cost?.measured === undefined
          ? {}
          : { measuredCostUsd: result.cost.measured.amountUsd }),
      },
      runtime,
    )
    await tx.updateExecutionSnapshot(
      execution.id,
      ExecutionStatus.RUNNING,
      ExecutionStatus.SUCCEEDED,
      completedAt,
    )
  })
}
