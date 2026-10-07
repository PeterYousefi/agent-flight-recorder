import type { JSX } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { request } from '@/lib/api'
import { ErrorState, Loading } from '@/components/states'
export const Route = createFileRoute('/settings')({ component: SettingsPage })
function SettingsPage(): JSX.Element {
  const query = useQuery({
    queryKey: ['ready'],
    queryFn: ({ signal }) => request<{ status: string }>('/ready', { signal }),
    refetchInterval: 5000,
  })
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          retry={() => {
            void query.refetch()
          }}
        />
      ) : (
        <div className="panel space-y-3 p-4">
          <h2 className="text-sm font-semibold">Local infrastructure</h2>
          <p className="font-mono text-xs text-success">API dependencies: {query.data.status}</p>
          <p className="text-sm text-muted-foreground">
            Readiness checks PostgreSQL, Service Bus emulator and private Azurite storage.
          </p>
          <a
            href="http://localhost:3000/api/docs"
            className="font-mono text-xs text-primary"
            target="_blank"
            rel="noreferrer"
          >
            API documentation ↗
          </a>
        </div>
      )}
    </div>
  )
}
