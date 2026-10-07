import {
  AttemptStatus,
  ExecutionStatus,
  ExecutionEventType,
  type ExecutionRepositories,
  type BudgetObservation,
} from '@afr/domain'
import { append, type Runtime } from './runtime.js'
import type { Claim } from './claim.js'
export async function budgetExceeded(
  tx: ExecutionRepositories,
  claim: Claim,
  observation: BudgetObservation,
  runtime: Runtime,
): Promise<void> {
  await tx.finishAttempt({
    ...claim.attempt,
    status: AttemptStatus.FAILED,
    completedAt: runtime.now(),
    errorCode: 'BUDGET_EXCEEDED',
    retryable: false,
  })
  await append(
    tx,
    claim.execution.id,
    ExecutionEventType.EXECUTION_BUDGET_EXCEEDED,
    { budgetType: observation.dimension, limit: observation.limit, observed: observation.usage },
    runtime,
  )
  await tx.updateExecutionSnapshot(
    claim.execution.id,
    ExecutionStatus.RUNNING,
    ExecutionStatus.BUDGET_EXCEEDED,
    runtime.now(),
  )
}
