import type { JSX } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, Server, Cpu } from 'lucide-react'
import { request, type Budget } from '@/lib/api'
import { JSONViewer } from '@/components/console/json-viewer'
import { ErrorState, Loading } from '@/components/states'
import { cn } from '@/lib/utils'
export const Route = createFileRoute('/settings')({ component: SettingsPage })
interface SettingsDto {
  budget_defaults: Budget
  azure_deployment_enabled: boolean
  providers: {
    name: string
    configured: boolean
    status: string
    capabilities?: Record<string, boolean>
  }[]
  infrastructure: Record<string, string>
  worker_concurrency: number
}
function SettingsPage(): JSX.Element {
  const query = useQuery({
    queryKey: ['settings'],
    queryFn: ({ signal }) => request<SettingsDto>('/settings', { signal }),
    refetchInterval: 10000,
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
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="font-mono text-[11px] text-muted-foreground">
          Read-only runtime configuration · credentials never displayed
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {query.data.providers.map((provider) => (
          <div className="panel space-y-3 p-4" key={provider.name}>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Cpu className="size-4 text-primary" />
              {provider.name === 'mock' ? 'MockProvider' : 'Sapiom Router'}
            </h2>
            <p
              className={cn(
                'font-mono text-xs',
                provider.configured ? 'text-success' : 'text-muted-foreground',
              )}
            >
              {provider.status.replaceAll('_', ' ')}
            </p>
            <p className="text-xs text-muted-foreground">
              {provider.name === 'mock'
                ? 'Deterministic scenarios, credential-free execution and synthetic costs.'
                : 'Optional chat completions adapter. Configuration does not verify live service health. Explicit environment opt-in is required.'}
            </p>
            {provider.capabilities && <JSONViewer data={provider.capabilities} />}
          </div>
        ))}
      </div>
      <div className="panel space-y-4 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Server className="size-4 text-primary" />
          Local infrastructure
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(query.data.infrastructure).map(([name, status]) => (
            <div
              key={name}
              className="flex items-center justify-between rounded-sm border border-border p-3 font-mono text-xs"
            >
              <span>{name.replaceAll('_', ' ')}</span>
              <span className={status === 'ready' ? 'text-success' : 'text-warning'}>{status}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Worker concurrency: {query.data.worker_concurrency}. Dependency health does not prove a
          worker process is running; Demo Lab verifies consumption.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel space-y-3 p-4">
          <h2 className="text-sm font-semibold">API budget defaults</h2>
          <JSONViewer data={query.data.budget_defaults} />
          <p className="text-xs text-muted-foreground">
            Demo Lab uses scenario-specific lower limits. Admission checks reduce exposure; a
            completed provider charge can exceed an estimate.
          </p>
        </div>
        <div className="panel space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-success" />
            Azure deployment disabled
          </h2>
          <p className="text-xs text-muted-foreground">
            Actual Azure resources deployed: none. Azure cost for local development/demo: $0.
            PostgreSQL, messaging, storage and telemetry run locally.
          </p>
          <a
            className="font-mono text-xs text-primary"
            href="http://localhost:3000/api/docs"
            target="_blank"
            rel="noreferrer"
          >
            API documentation ↗
          </a>
        </div>
      </div>
    </div>
  )
}
