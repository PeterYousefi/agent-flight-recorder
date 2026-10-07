import { Toaster } from 'sonner'
import type { JSX } from 'react'
import { createRootRouteWithContext, Outlet, Link } from '@tanstack/react-router'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { AppShell } from '@/components/console/app-shell'
import { ErrorState } from '@/components/states'
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
  errorComponent: ({ reset }) => (
    <ErrorState error={new Error('The page could not load.')} retry={reset} />
  ),
  notFoundComponent: () => (
    <div className="panel p-6">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <Link to="/" className="text-primary">
        Return to overview
      </Link>
    </div>
  ),
})
function Root(): JSX.Element {
  const { queryClient } = Route.useRouteContext()
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell>
        <Outlet />
        <Toaster theme="dark" richColors closeButton />
      </AppShell>
    </QueryClientProvider>
  )
}
