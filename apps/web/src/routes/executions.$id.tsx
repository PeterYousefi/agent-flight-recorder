import { useEffect, useRef, useState, type JSX } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Copy, ExternalLink, GitBranch, ListTree, RefreshCw, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { detail, request, terminal, type ExecutionDto, type ArtifactDto } from '@/lib/api'
import { ExecutionStatusBadge } from '@/components/console/status-badge'
import { JSONViewer } from '@/components/console/json-viewer'
import { FlightRecorder } from '@/components/console/flight-recorder'
import { ExecutionGraph } from '@/components/console/execution-graph'
import { MetricCard } from '@/components/console/metric-card'
import { project, timeline, fmtCost, fmtDuration, fmtTime } from '@/lib/data'
import { Loading, ErrorState } from '@/components/states'
import { cn } from '@/lib/utils'
export const Route = createFileRoute('/executions/$id')({ component: DetailPage })
const tabs = ['Events', 'Logs', 'Cost', 'Artifacts', 'Trace', 'Raw'] as const
function Artifact({ item, executionId }: { item: ArtifactDto; executionId: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const query = useQuery({
    queryKey: ['artifact', executionId, item.id],
    queryFn: ({ signal }) => request(`/executions/${executionId}/artifacts/${item.id}`, { signal }),
    enabled: open,
  })
  return (
    <div className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono text-xs">
            {item.kind} · {item.size_bytes} bytes
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {item.id} · {item.content_type}
          </p>
        </div>
        <button className="btn-secondary" onClick={() => setOpen(!open)}>
          {open ? 'Hide content' : 'Read private artifact'}
        </button>
      </div>
      {open &&
        (query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <ErrorState
            error={query.error}
            retry={() => {
              void query.refetch()
            }}
          />
        ) : (
          <JSONViewer data={query.data} />
        ))}
    </div>
  )
}
function DetailPage(): JSX.Element {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const cache = useQueryClient()
  const [view, setView] = useState<'timeline' | 'graph'>('timeline')
  const [tab, setTab] = useState<(typeof tabs)[number]>('Events')
  const replayStarted = useRef<string | null>(null)
  const query = useQuery({
    queryKey: ['detail', id],
    queryFn: ({ signal }) => detail(id, signal),
    refetchInterval: (q) =>
      q.state.data && terminal(q.state.data.execution.status) ? false : 1000,
  })
  const action = useMutation({
    mutationFn: ({
      kind,
      mode,
    }: {
      kind: 'cancel' | 'retry' | 'replay'
      mode?: 'input' | 'simulation'
    }) =>
      request<ExecutionDto>(`/executions/${id}/${kind}`, {
        method: 'POST',
        ...(kind === 'replay' ? { body: { mode: mode ?? 'simulation', carry_budget: true } } : {}),
      }),
    onSuccess: async (result) => {
      await cache.invalidateQueries({ queryKey: ['detail', id] })
      await cache.invalidateQueries({ queryKey: ['overview'] })
      if (result.id !== id) {
        toast.success('Created a new execution. Original history is preserved.')
        await navigate({ to: '/executions/$id', params: { id: result.id } })
      } else toast.success('Cancellation recorded. In-flight provider work may still settle.')
    },
    onError: (error) => {
      toast.error(error.message)
      void query.refetch()
    },
  })
  const runAction = action.mutate
  useEffect(() => {
    if (
      query.data?.execution.status === 'SUCCEEDED' &&
      sessionStorage.getItem(`afr-replay-${id}`) === 'pending' &&
      replayStarted.current !== id
    ) {
      replayStarted.current = id
      sessionStorage.removeItem(`afr-replay-${id}`)
      runAction({ kind: 'replay', mode: 'simulation' })
    }
  }, [id, query.data?.execution.status, runAction])
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
  const data = query.data
  const execution = project(data.execution, data.cost)
  const events = timeline(data.events, execution.startedAt)
  const trace = data.events.find((event) => event.correlation?.trace_id)?.correlation?.trace_id
  const canCancel = ['PENDING', 'QUEUED', 'RUNNING', 'WAITING', 'RETRY_SCHEDULED'].includes(
    data.execution.status,
  )
  const canRetry = ['FAILED', 'DEAD_LETTERED', 'BUDGET_EXCEEDED'].includes(data.execution.status)
  const traceUrl = trace
    ? `http://localhost:3001/explore?left=${encodeURIComponent(JSON.stringify({ datasource: 'tempo', queries: [{ refId: 'A', queryType: 'traceId', query: trace }], range: { from: 'now-1h', to: 'now' } }))}`
    : null
  return (
    <div className="space-y-5">
      <Link to="/executions" className="font-mono text-xs text-muted-foreground hover:text-primary">
        ← Executions
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-all font-mono text-base font-semibold">{id}</h1>
            <ExecutionStatusBadge status={execution.status} />
            <button
              aria-label="Copy execution ID"
              className="text-muted-foreground hover:text-primary"
              onClick={() => {
                void navigator.clipboard.writeText(id).then(
                  () => toast.success('Execution ID copied'),
                  () => toast.error('Clipboard unavailable'),
                )
              }}
            >
              <Copy className="size-3.5" />
            </button>
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {execution.agent} · {execution.provider} · {execution.operation} · {execution.attempts}/
            {execution.maxAttempts ?? '—'} attempts
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            Started {fmtTime(data.execution.created_at)} ·{' '}
            {terminal(data.execution.status)
              ? `Ended ${fmtTime(data.execution.updated_at)}`
              : 'Live execution'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCancel && (
            <button
              className="btn-secondary"
              disabled={action.isPending}
              onClick={() => action.mutate({ kind: 'cancel' })}
            >
              <Ban className="size-3.5" />
              Cancel
            </button>
          )}
          {canRetry && (
            <button
              className="btn-secondary"
              disabled={action.isPending}
              onClick={() => action.mutate({ kind: 'retry' })}
            >
              <RotateCcw className="size-3.5" />
              Retry
            </button>
          )}
          {terminal(data.execution.status) && (
            <>
              <button
                className="btn-primary"
                disabled={action.isPending}
                onClick={() => action.mutate({ kind: 'replay', mode: 'simulation' })}
              >
                <RefreshCw className="size-3.5" />
                Replay simulation
              </button>
              <button
                className="btn-secondary"
                disabled={action.isPending}
                onClick={() => action.mutate({ kind: 'replay', mode: 'input' })}
              >
                Replay original input
              </button>
            </>
          )}
        </div>
      </div>
      {execution.replayOf && (
        <div className="panel flex flex-wrap items-center gap-2 p-3 font-mono text-xs text-muted-foreground">
          <GitBranch className="size-3.5 text-primary" />
          {data.execution.replay_mode} replay of{' '}
          <Link
            to="/executions/$id"
            params={{ id: execution.replayOf }}
            className="text-primary hover:underline"
          >
            {execution.replayOf}
          </Link>{' '}
          · Original history unchanged
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Wall duration"
          value={fmtDuration(
            terminal(data.execution.status)
              ? execution.durationMs
              : Date.now() - Date.parse(execution.startedAt),
          )}
        />
        <MetricCard label="Estimated cost" value={fmtCost(execution.estimatedCostUsd)} />
        <MetricCard label="Measured cost" value={fmtCost(execution.measuredCostUsd)} />
        <MetricCard label="Recorded facts" value={String(data.events.length)} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-sm border border-border bg-card p-0.5"
          role="group"
          aria-label="Execution visualization"
        >
          <button
            aria-pressed={view === 'timeline'}
            onClick={() => setView('timeline')}
            className={cn(
              'flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs',
              view === 'timeline' ? 'bg-accent text-foreground' : 'text-muted-foreground',
            )}
          >
            <ListTree className="size-3.5" />
            Timeline
          </button>
          <button
            aria-pressed={view === 'graph'}
            onClick={() => setView('graph')}
            className={cn(
              'flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs',
              view === 'graph' ? 'bg-accent text-foreground' : 'text-muted-foreground',
            )}
          >
            <GitBranch className="size-3.5" />
            Graph
          </button>
        </div>
        <span className="max-w-full truncate font-mono text-[11px] text-muted-foreground">
          trace {trace ?? 'unavailable'}
        </span>
      </div>
      {view === 'timeline' ? (
        <FlightRecorder events={events} startIso={execution.startedAt} />
      ) : (
        <ExecutionGraph events={events} />
      )}
      <div className="space-y-4">
        <div
          role="tablist"
          aria-label="Execution details"
          className="flex gap-1 overflow-x-auto border-b border-border"
        >
          {tabs.map((name, index) => (
            <button
              key={name}
              role="tab"
              id={`tab-${name}`}
              aria-controls={`panel-${name}`}
              aria-selected={tab === name}
              tabIndex={tab === name ? 0 : -1}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                  event.preventDefault()
                  const next =
                    tabs[
                      (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
                    ]
                  if (next) {
                    setTab(next)
                    document.getElementById(`tab-${next}`)?.focus()
                  }
                }
              }}
              onClick={() => setTab(name)}
              className={cn(
                'shrink-0 border-b-2 px-3 py-2 font-mono text-xs',
                tab === name
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {name}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
          {tab === 'Events' && <JSONViewer data={data.events} />}
          {tab === 'Logs' && (
            <div className="panel p-4">
              <p className="mb-3 text-xs text-muted-foreground">
                Structured fact log reconstructed from persisted events. Process stdout logs are
                emitted separately; no log backend is configured.
              </p>
              <pre className="overflow-auto font-mono text-[11px] leading-6 text-muted-foreground">
                {data.events
                  .map((event) =>
                    JSON.stringify({
                      timestamp: event.timestamp,
                      execution_id: id,
                      sequence: event.sequence,
                      event_type: event.event_type,
                      trace_id: event.correlation?.trace_id,
                    }),
                  )
                  .join('\n')}
              </pre>
            </div>
          )}
          {tab === 'Cost' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {execution.provider === 'mock'
                  ? 'Mock provider costs are synthetic.'
                  : 'Unknown means the provider returned no verified price.'}{' '}
                Estimates and measurements are separate; totals include every recorded attempt.
              </p>
              <JSONViewer data={{ ...data.cost, budget_policy: data.execution.budget_policy }} />
            </div>
          )}
          {tab === 'Artifacts' &&
            (data.artifacts.length === 0 ? (
              <div className="panel p-6 text-xs text-muted-foreground">
                No artifacts recorded for this execution.
              </div>
            ) : (
              <div className="space-y-3">
                {data.artifacts.map((item) => (
                  <Artifact key={item.id} item={item} executionId={id} />
                ))}
              </div>
            ))}
          {tab === 'Trace' && (
            <div className="panel space-y-3 p-4">
              <p className="break-all font-mono text-xs">
                {trace ?? 'No persisted trace correlation is available.'}
              </p>
              {traceUrl && (
                <a
                  className="btn-secondary inline-flex"
                  href={traceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open trace in Grafana <ExternalLink className="size-3.5" />
                </a>
              )}
              <p className="text-xs text-muted-foreground">
                Best-effort telemetry; persistence remains authoritative. Tempo retention may expire
                an older trace.
              </p>
              <JSONViewer
                data={data.events.map((event) => ({
                  sequence: event.sequence,
                  event_type: event.event_type,
                  ...event.correlation,
                }))}
              />
            </div>
          )}
          {tab === 'Raw' && <JSONViewer data={data} />}
        </div>
      </div>
    </div>
  )
}
