import { useState, type JSX } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Lock, RotateCcw } from 'lucide-react'
import { request, type Page, type DeadLetterDto, type ExecutionDto } from '@/lib/api'
import { fmtTime } from '@/lib/data'
import { Loading, ErrorState } from '@/components/states'
export const Route = createFileRoute('/dead-letter')({ component: DeadLetterPage })
function DeadLetterPage(): JSX.Element {
  const [offset, setOffset] = useState(0)
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['dead-letter', offset],
    queryFn: ({ signal }) =>
      request<Page<DeadLetterDto>>(`/dead-letter?limit=25&offset=${offset}`, { signal }),
    refetchInterval: 2000,
  })
  const requeue = useMutation({
    mutationFn: (id: string) =>
      request<ExecutionDto>(`/dead-letter/${id}/requeue`, { method: 'POST' }),
    onSuccess: async (e) => {
      await navigate({ to: '/executions/$id', params: { id: e.id } })
    },
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
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Dead Letter</h1>
        <p className="font-mono text-[11px] text-muted-foreground">
          Terminal provider failures · immutable history
        </p>
      </div>
      <div className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning/5 px-3.5 py-2.5">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-warning" />
        <p className="text-xs leading-relaxed">
          Requeue creates a new execution linked to the original. Historical executions and their
          events stay unchanged.
        </p>
      </div>
      {requeue.isError && <ErrorState error={requeue.error} />}
      <div className="panel overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase text-muted-foreground">
              {['Execution', 'Reason', 'Attempts', 'Dead-lettered', 'Actions'].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {query.data.items.map((d) => (
              <tr key={d.id} className="border-b border-border/50 last:border-0 hover:bg-accent/40">
                <td className="px-3 py-3">
                  <Link
                    to="/executions/$id"
                    params={{ id: d.execution_id }}
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {d.execution_id.slice(0, 18)}…
                  </Link>
                </td>
                <td className="px-3 py-3 font-mono text-xs text-destructive">{d.reason}</td>
                <td className="px-3 py-3 font-mono text-xs">{d.final_attempt}</td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-[11px] text-muted-foreground">
                  {fmtTime(d.dead_lettered_at)}
                </td>
                <td className="px-3 py-3">
                  {d.requeued_execution_id ? (
                    <Link
                      to="/executions/$id"
                      params={{ id: d.requeued_execution_id }}
                      className="font-mono text-xs text-primary"
                    >
                      Inspect requeue →
                    </Link>
                  ) : (
                    <button
                      disabled={requeue.isPending}
                      onClick={() => requeue.mutate(d.id)}
                      className="inline-flex items-center gap-1 rounded border border-input px-2 py-1 font-mono text-xs disabled:opacity-50"
                    >
                      <RotateCcw className="size-3" />
                      Requeue
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {query.data.items.length === 0 && (
          <p className="p-10 text-center font-mono text-xs text-muted-foreground">
            No historical dead letters.
          </p>
        )}
      </div>
      <div className="flex justify-between font-mono text-xs">
        <button
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 25))}
          className="disabled:opacity-40"
        >
          Previous
        </button>
        <button
          disabled={query.data.next_offset === null}
          onClick={() => setOffset(query.data.next_offset ?? offset)}
          className="disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}
