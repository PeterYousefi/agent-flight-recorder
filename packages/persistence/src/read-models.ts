import type { Prisma } from '@prisma/client'
import type { ExecutionSummary, ExecutionOverview } from '@afr/domain'
import { PersistenceError } from './errors.js'
export async function readSummaries(
  db: Prisma.TransactionClient,
  ids: readonly string[],
): Promise<readonly ExecutionSummary[]> {
  if (ids.length > 100) throw new PersistenceError('INVALID_RECORD', 'Too many summary identifiers')
  if (ids.length === 0) return []
  const [attempts, costs] = await Promise.all([
    db.executionAttempt.groupBy({
      by: ['executionId'],
      where: { executionId: { in: [...ids] } },
      _count: { _all: true },
    }),
    db.costRecord.groupBy({
      by: ['executionId', 'kind'],
      where: { executionId: { in: [...ids] } },
      _sum: { amountMicroUsd: true },
    }),
  ])
  return ids.map((executionId) => ({
    executionId,
    attemptCount: attempts.find((a) => a.executionId === executionId)?._count._all ?? 0,
    estimatedMicroUsd:
      costs.find((c) => c.executionId === executionId && c.kind === 'estimated')?._sum
        .amountMicroUsd ?? null,
    measuredMicroUsd:
      costs.find((c) => c.executionId === executionId && c.kind === 'measured')?._sum
        .amountMicroUsd ?? null,
  }))
}
export async function readOverview(db: Prisma.TransactionClient): Promise<ExecutionOverview> {
  const [statuses, costs, retries, replays, toolCalls, pendingOutbox, latency, hourly] =
    await Promise.all([
      db.execution.groupBy({ by: ['status'], _count: { _all: true } }),
      db.costRecord.groupBy({ by: ['kind'], _sum: { amountMicroUsd: true } }),
      db.executionEvent.count({ where: { eventType: 'execution.retry_scheduled' } }),
      db.replayRelationship.count(),
      db.executionEvent.count({ where: { eventType: 'tool.started' } }),
      db.messageOutbox.count({ where: { publishedAt: null } }),
      db.$queryRaw<
        Array<{ p50: number | null; p95: number | null }>
      >`SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM updated_at - created_at)) AS p50, percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM updated_at - created_at)) AS p95 FROM executions WHERE status IN ('SUCCEEDED','CANCELLED','DEAD_LETTERED','BUDGET_EXCEEDED')`,
      db.$queryRaw<
        Array<{ hour: Date; created: bigint; succeeded: bigint; failed: bigint }>
      >`SELECT date_trunc('hour', created_at) AS hour, COUNT(*) AS created, COUNT(*) FILTER (WHERE status = 'SUCCEEDED') AS succeeded, COUNT(*) FILTER (WHERE status IN ('FAILED','DEAD_LETTERED','BUDGET_EXCEEDED')) AS failed FROM executions WHERE created_at >= NOW() - INTERVAL '24 hours' GROUP BY 1 ORDER BY 1`,
    ])
  const count = (status: string): number =>
    statuses.find((s) => s.status === status)?._count._all ?? 0
  return {
    total: statuses.reduce((n, s) => n + s._count._all, 0),
    succeeded: count('SUCCEEDED'),
    failed: count('FAILED') + count('DEAD_LETTERED') + count('BUDGET_EXCEEDED'),
    cancelled: count('CANCELLED'),
    budgetExceeded: count('BUDGET_EXCEEDED'),
    deadLetters: count('DEAD_LETTERED'),
    retries,
    replays,
    toolCalls,
    pendingOutbox,
    p50Seconds: latency[0]?.p50 ?? null,
    p95Seconds: latency[0]?.p95 ?? null,
    estimatedMicroUsd: costs.find((c) => c.kind === 'estimated')?._sum.amountMicroUsd ?? null,
    measuredMicroUsd: costs.find((c) => c.kind === 'measured')?._sum.amountMicroUsd ?? null,
    hourly: hourly.map((r) => ({
      hour: r.hour.toISOString(),
      created: Number(r.created),
      succeeded: Number(r.succeeded),
      failed: Number(r.failed),
    })),
  }
}
