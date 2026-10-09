import type { JSX } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { request, publicDemo, grafanaUrl, prometheusUrl, type OverviewDto } from '@/lib/api'
import { MetricCard } from '@/components/console/metric-card'
import { fmtDuration } from '@/lib/data'
import { Loading, ErrorState } from '@/components/states'
export const Route = createFileRoute('/observability')({ component: ObservabilityPage })
function ObservabilityPage(): JSX.Element {
  const query = useQuery({
    queryKey: ['overview'],
    queryFn: ({ signal }) => request<OverviewDto>('/overview', { signal }),
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
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Observability</h1>
        <p className="font-mono text-[11px] text-muted-foreground">
          {publicDemo
            ? 'Persisted observations · hosted demo'
            : 'Persisted aggregate observations · local OpenTelemetry stack'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="P50 latency"
          value={fmtDuration(s.p50_seconds === null ? null : s.p50_seconds * 1000)}
        />
        <MetricCard
          label="P95 latency"
          value={fmtDuration(s.p95_seconds === null ? null : s.p95_seconds * 1000)}
        />
        <MetricCard
          label="Throughput (24h avg)"
          value={`${(s.hourly.reduce((sum, h) => sum + h.created, 0) / 24).toFixed(1)}/h`}
          hint="Persisted execution creations"
        />
        <MetricCard
          label="Errors"
          value={String(s.failed)}
          hint="Historical failed/budget/dead-letter executions"
        />
        <MetricCard label="Retries" value={String(s.retries)} />
        <MetricCard label="Tool/provider calls" value={String(s.tool_calls)} />
        <MetricCard
          label="Pending outbox"
          value={String(s.pending_outbox)}
          hint="Durable scheduled messages"
        />
        <MetricCard
          label="Transport queue depth"
          value="Unavailable"
          hint={
            publicDemo
              ? 'Queue administration access is not granted'
              : 'Emulator counter limitation'
          }
        />
        <MetricCard label="Dead letters" value={String(s.dead_letters)} />
        <MetricCard label="Replays" value={String(s.replays)} />
      </div>
      <div className="panel space-y-3 p-4">
        <h2 className="text-sm font-semibold">
          {publicDemo ? 'Traces and metrics' : 'Local traces and metrics'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {publicDemo && !grafanaUrl
            ? 'These metrics come from persisted execution facts. Trace correlation remains available in execution history. Public Grafana, Prometheus and span viewers are not configured for this sandbox.'
            : 'Grafana displays real execution rates, latency histograms, failures, costs and queue activity. Trace IDs in execution events connect HTTP, queue, worker, provider and artifact spans.'}
        </p>
        {grafanaUrl && prometheusUrl && (
          <div className="flex flex-wrap gap-3 font-mono text-xs">
            <a
              href={`${grafanaUrl}/d/afr-operations`}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Grafana dashboard ↗
            </a>
            <a
              href={prometheusUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Prometheus ↗
            </a>
            <a
              href={`${grafanaUrl}/explore`}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Tempo traces ↗
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
