import {
  ExecutionStatus,
  AttemptStatus,
  ExecutionEventType,
  evaluateBudget,
  type ExecutionStore,
} from '@afr/domain'
import { append, type Runtime } from './runtime.js'
import { executionUsage, admission } from './budgets.js'
import { budgetExceeded } from './budget-effects.js'
import type { Claim } from './claim.js'
export async function admitExecution(
  store: ExecutionStore,
  claim: Claim,
  estimate: number | null,
  runtime: Runtime,
): Promise<boolean> {
  return store.transaction(claim.execution.id, async (tx) => {
    const current = await tx.getExecution(claim.execution.id)
    const active = (await tx.listAttempts(claim.execution.id)).find(
      (attempt) => attempt.id === claim.attempt.id,
    )
    if (active?.status !== AttemptStatus.RUNNING) return false
    if (current?.status === ExecutionStatus.CANCELLED) {
      await tx.finishAttempt({
        ...claim.attempt,
        status: AttemptStatus.CANCELLED,
        completedAt: runtime.now(),
      })
      return false
    }
    if (current?.status !== ExecutionStatus.RUNNING) return false
    const decisions = admission(
      current,
      await executionUsage(tx, current, runtime.now()),
      estimate ?? 0,
    )
    const denied = decisions.find((d) => d.kind === 'DENY')
    if (denied?.kind === 'DENY') {
      const observation = denied.observation
      await budgetExceeded(tx, claim, observation, runtime)
      return false
    }
    for (const decision of decisions)
      if (decision.kind === 'WARN')
        await append(
          tx,
          current.id,
          ExecutionEventType.BUDGET_WARNING,
          {
            budgetType: decision.observation.dimension,
            threshold: decision.observation.limit,
            observed: decision.observation.usage,
          },
          runtime,
        )
    if (estimate !== null) {
      await tx.recordCost({
        id: runtime.id(),
        executionId: current.id,
        attemptId: claim.attempt.id,
        category: 'provider',
        kind: 'estimated',
        amountMicroUsd: BigInt(Math.round(estimate * 1_000_000)),
        timestamp: runtime.now(),
      })
    }
    const usageAfterEstimate = await executionUsage(tx, current, runtime.now())
    for (const warning of evaluateBudget(current.request.budgetPolicy, usageAfterEstimate)
      .warnings) {
      if (warning.dimension === 'cost')
        await append(
          tx,
          current.id,
          ExecutionEventType.BUDGET_WARNING,
          { budgetType: 'cost', threshold: warning.limit * 0.8, observed: warning.usage },
          runtime,
        )
    }
    await append(
      tx,
      current.id,
      ExecutionEventType.TOOL_REQUESTED,
      {
        toolName: current.request.operation,
        toolInvocationId: claim.attempt.id,
        attemptNumber: claim.attempt.attemptNumber,
      },
      runtime,
    )
    await append(
      tx,
      current.id,
      ExecutionEventType.TOOL_STARTED,
      {
        toolName: current.request.operation,
        toolInvocationId: claim.attempt.id,
        attemptNumber: claim.attempt.attemptNumber,
      },
      runtime,
    )
    return true
  })
}
