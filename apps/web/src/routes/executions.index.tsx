import { useState, type JSX } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { request, type ExecutionDto, type Page } from '@/lib/api'
import { project } from '@/lib/data'
import { ExecutionTable } from '@/components/console/execution-table'
import { Loading, ErrorState } from '@/components/states'
export const Route = createFileRoute('/executions/')({ component: ExecutionsPage })
function ExecutionsPage(): JSX.Element {
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const query = useQuery({
    queryKey: ['executions', offset, status],
    queryFn: ({ signal }) =>
      request<Page<ExecutionDto>>(
        `/executions?limit=25&offset=${offset}${status ? `&status=${status}` : ''}`,
        { signal },
      ),
    refetchInterval: 2000,
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
  const rows = query.data.items
    .map((e) => project(e))
    .filter((e) => `${e.id} ${e.agent} ${e.provider}`.toLowerCase().includes(search.toLowerCase()))
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Executions</h1>
        <p className="font-mono text-[11px] text-muted-foreground">
          Persisted execution snapshots · local-dev · live refresh
        </p>
      </div>
      <div className="panel flex flex-wrap gap-2 p-2.5">
        <label className="flex items-center gap-2 rounded-sm border border-input px-2">
          <Search className="size-3" />
          <input
            aria-label="Search current page"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search current page…"
            className="h-7 w-52 bg-transparent font-mono text-[11px] outline-none"
          />
        </label>
        <select
          aria-label="Execution status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setOffset(0)
          }}
          className="rounded-sm border border-input bg-card px-2 font-mono text-[11px]"
        >
          <option value="">All statuses</option>
          {[
            'PENDING',
            'QUEUED',
            'RUNNING',
            'WAITING',
            'RETRY_SCHEDULED',
            'SUCCEEDED',
            'FAILED',
            'CANCELLED',
            'BUDGET_EXCEEDED',
            'DEAD_LETTERED',
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <ExecutionTable executions={rows} />
      <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
        <button
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 25))}
          className="rounded border border-input px-3 py-1 disabled:opacity-40"
        >
          Previous
        </button>
        <span>
          Page {Math.floor(offset / 25) + 1} · {rows.length} displayed
        </span>
        <button
          disabled={query.data.next_offset === null}
          onClick={() => setOffset(query.data.next_offset ?? offset)}
          className="rounded border border-input px-3 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}
