import {
  canSpend,
  canStartAttempt,
  canStartToolCall,
  canContinueDuration,
  type BudgetDecision,
  type Execution,
  type ExecutionRepositories,
  type ExecutionUsage,
} from '@afr/domain'

export async function executionUsage(
  tx: ExecutionRepositories,
  execution: Execution,
  now: Date,
): Promise<ExecutionUsage> {
  const costs = await tx.listCosts(execution.id)
  const grouped = new Map<string, { estimated: number; measured: number; hasMeasured: boolean }>()
  for (const cost of costs) {
    const key = cost.attemptId ?? 'execution'
    const totals = grouped.get(key) ?? { estimated: 0, measured: 0, hasMeasured: false }
    const usd = Number(cost.amountMicroUsd) / 1_000_000
    if (cost.kind === 'measured') {
      totals.measured += usd
      totals.hasMeasured = true
    } else totals.estimated += usd
    grouped.set(key, totals)
  }
  const spent = [...grouped.values()].reduce(
    (sum, cost) => sum + (cost.hasMeasured ? cost.measured : cost.estimated),
    0,
  )
  return {
    estimatedCostUsd: spent,
    attempts: (await tx.listAttempts(execution.id)).length,
    elapsedSeconds: Math.max(0, (now.getTime() - execution.createdAt.getTime()) / 1000),
    toolCalls: (await tx.listEvents(execution.id)).filter((e) => e.eventType === 'tool.started')
      .length,
  }
}
export function admission(
  execution: Execution,
  usage: ExecutionUsage,
  estimate: number,
): readonly BudgetDecision[] {
  return [
    canStartAttempt(execution.request.budgetPolicy, {
      ...usage,
      attempts: Math.max(0, usage.attempts - 1),
    }),
    canStartToolCall(execution.request.budgetPolicy, usage),
    canContinueDuration(execution.request.budgetPolicy, usage),
    canSpend(execution.request.budgetPolicy, usage, { estimatedAdditionalCostUsd: estimate }),
  ]
}
