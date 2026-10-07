import type { JSX } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { FlaskConical, Play, Loader2 } from 'lucide-react'
import { request, type DemoDto, type ExecutionDto } from '@/lib/api'
import { Loading, ErrorState } from '@/components/states'
export const Route = createFileRoute('/demo-lab')({ component: DemoPage })
function DemoPage(): JSX.Element {
  const navigate = useNavigate()
  const catalog = useQuery({
    queryKey: ['demos'],
    queryFn: ({ signal }) => request<{ items: DemoDto[] }>('/demo/scenarios', { signal }),
  })
  const run = useMutation({
    mutationFn: (id: string) =>
      request<ExecutionDto & { followup_replay: boolean }>(`/demo/scenarios/${id}/run`, {
        method: 'POST',
      }),
    onSuccess: async (execution) => {
      if (execution.followup_replay) sessionStorage.setItem(`afr-replay-${execution.id}`, 'pending')
      await navigate({ to: '/executions/$id', params: { id: execution.id } })
    },
  })
  if (catalog.isPending) return <Loading />
  if (catalog.isError)
    return (
      <ErrorState
        error={catalog.error}
        retry={() => {
          void catalog.refetch()
        }}
      />
    )
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 items-center justify-center rounded-sm border border-border bg-card text-primary">
          <FlaskConical className="size-4" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Demo Lab</h1>
          <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            Run a real recorded execution against MockProvider. Inspect retries, budgets, dead
            letters and replay without external calls. All displayed demo costs are synthetic.
          </p>
        </div>
      </div>
      {run.isError && <ErrorState error={run.error} />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {catalog.data.items.map((s) => (
          <div
            key={s.id}
            className="panel flex flex-col p-4 transition-colors hover:border-ring/40"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-sm border border-border bg-muted text-primary">
                <Play className="size-4" />
              </div>
              <h2 className="text-sm font-semibold tracking-tight">{s.title}</h2>
            </div>
            <p className="mt-2.5 flex-1 text-[13px] leading-relaxed text-muted-foreground">
              {s.description}
            </p>
            <div className="mt-3 rounded-sm border border-border bg-background/50 px-2.5 py-2 font-mono text-[11px] text-muted-foreground">
              MockProvider · no external credentials
            </div>
            <button
              onClick={() => run.mutate(s.id)}
              disabled={run.isPending}
              className="mt-4 inline-flex h-8 items-center justify-center gap-2 rounded-sm bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {run.isPending && run.variables === s.id ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              Run Demo
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
