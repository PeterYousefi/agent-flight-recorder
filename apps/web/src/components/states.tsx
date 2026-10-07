import type { JSX } from 'react'
export function Loading(): JSX.Element {
  return (
    <div aria-label="Loading" aria-busy="true" className="space-y-3">
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="panel h-36 animate-pulse" />
      <div className="panel h-64 animate-pulse" />
    </div>
  )
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }): JSX.Element {
  return (
    <div role="alert" className="panel space-y-3 p-6">
      <h2 className="font-semibold">Unable to load this view</h2>
      <p className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : 'Please try again.'}
      </p>
      {retry && (
        <button
          className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
          onClick={retry}
        >
          Try again
        </button>
      )}
    </div>
  )
}
