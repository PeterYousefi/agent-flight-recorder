import type { JSX } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { detail } from '@/lib/api'
import { ExecutionStatusBadge } from '@/components/console/status-badge'
import { JSONViewer } from '@/components/console/json-viewer'
import { project } from '@/lib/data'
import { Loading, ErrorState } from '@/components/states'
export const Route = createFileRoute('/executions/$id')({ component: DetailPage })
function DetailPage(): JSX.Element {
  const { id } = Route.useParams()
  const query = useQuery({
    queryKey: ['detail', id],
    queryFn: ({ signal }) => detail(id, signal),
    refetchInterval: 1500,
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
  const execution = project(query.data.execution, query.data.cost)
  return (
    <div className="space-y-4">
      <Link to="/executions" className="font-mono text-xs text-primary">
        ← Executions
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="break-all font-mono text-base font-semibold">{id}</h1>
        <ExecutionStatusBadge status={execution.status} />
      </div>
      <p className="font-mono text-xs text-muted-foreground">
        {execution.agent} · {execution.provider} · {execution.operation} · {execution.attempts}{' '}
        attempts
      </p>
      <JSONViewer data={query.data} />
    </div>
  )
}
