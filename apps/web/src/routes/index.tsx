import type { JSX } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { request, publicDemo, type OverviewDto, type Page, type ExecutionDto } from '@/lib/api'
import { fmtCost, fmtDuration, usd, project } from '@/lib/data'
import { MetricCard } from '@/components/console/metric-card'
import { ExecutionTable } from '@/components/console/execution-table'
import { Loading, ErrorState } from '@/components/states'
export const Route = createFileRoute('/')({ component: OverviewPage })
function OverviewPage(): JSX.Element {
  const query = useQuery({
    queryKey: ['overview'],
    queryFn: ({ signal }) => request<OverviewDto>('/overview', { signal }),
    refetchInterval: 3000,
  })
  const recent = useQuery({
    queryKey: ['recent'],
    queryFn: ({ signal }) => request<Page<ExecutionDto>>('/executions?limit=8', { signal }),
    refetchInterval: 3000,
  })
  if (query.isPending) return <Loading />
  if (query.isError)
    return (
      <ErrorState
        error={query.error}
        retry={() => {
          void query.refetch()
        }}
      />
    )
  const s = query.data
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Overview</h1>
          <p className="font-mono text-[11px] text-muted-foreground">
            All persisted history · {publicDemo ? 'public sandbox' : 'local-dev'} · updated live
          </p>
        </div>
        <Link to="/executions" className="font-mono text-xs text-primary">
          All executions →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <MetricCard label="Executions" value={String(s.total)} />
        <MetricCard
          label="Success rate"
          value={s.total ? `${((100 * s.succeeded) / s.total).toFixed(1)}%` : '—'}
          hint="Of all executions"
        />
        <MetricCard
          label="Failure rate"
          value={s.total ? `${((100 * s.failed) / s.total).toFixed(1)}%` : '—'}
          hint="Includes budget rejections"
        />
        <MetricCard
          label="P95 latency"
          value={fmtDuration(s.p95_seconds === null ? null : s.p95_seconds * 1000)}
          hint="Terminal wall duration"
        />
        <MetricCard
          label="Estimated cost"
          value={fmtCost(usd(s.estimated_micro_usd))}
          hint="Mock costs are synthetic"
        />
        <MetricCard
          label="Measured cost"
          value={fmtCost(usd(s.measured_micro_usd))}
          hint="Only supplied charges"
        />
        <MetricCard label="Retries" value={String(s.retries)} />
        <MetricCard
          label="Dead letters"
          value={String(s.dead_letters)}
          hint="Immutable historical records"
        />
      </div>
      <div className="panel p-4">
        <h2 className="text-[13px] font-semibold">Execution Activity</h2>
        <p className="mb-3 font-mono text-[11px] text-muted-foreground">
          Last 24h · grouped by creation hour (UTC)
        </p>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={s.hourly.map((h) => ({ ...h, time: h.hour.slice(11, 16) }))}
              margin={{ left: -18, right: 4, top: 4, bottom: 0 }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--popover)',
                  border: '1px solid var(--border)',
                  fontSize: 11,
                }}
              />
              <Area
                dataKey="succeeded"
                stackId="1"
                stroke="var(--success)"
                fill="var(--success)"
                fillOpacity={0.18}
              />
              <Area
                dataKey="failed"
                stackId="1"
                stroke="var(--destructive)"
                fill="var(--destructive)"
                fillOpacity={0.25}
              />
              <Area dataKey="created" stroke="var(--primary)" fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="flex justify-between">
        <h2 className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
          Recent executions
        </h2>
        <Link to="/demo-lab" className="font-mono text-xs text-primary">
          Run a demo →
        </Link>
      </div>
      {recent.isPending ? (
        <Loading />
      ) : recent.isError ? (
        <ErrorState error={recent.error} />
      ) : (
        <ExecutionTable executions={recent.data.items.map((e) => project(e))} compact />
      )}
    </div>
  )
}
