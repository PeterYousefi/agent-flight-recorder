import type { JSX } from 'react'
import { cn } from '@/lib/utils'
import type { ExecutionStatus, EventStatus } from '@/lib/data'

const statusConfig: Record<
  ExecutionStatus,
  { label: string; dot: string; text: string; pulse?: boolean }
> = {
  pending: { label: 'Pending', dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
  queued: { label: 'Queued', dot: 'bg-info', text: 'text-info' },
  budget_exceeded: { label: 'Budget exceeded', dot: 'bg-warning', text: 'text-warning' },
  completed: { label: 'Completed', dot: 'bg-success', text: 'text-success' },
  failed: { label: 'Failed', dot: 'bg-destructive', text: 'text-destructive' },
  running: { label: 'Running', dot: 'bg-info', text: 'text-info', pulse: true },
  retrying: { label: 'Retrying', dot: 'bg-primary', text: 'text-primary', pulse: true },
  waiting: { label: 'Waiting', dot: 'bg-waiting', text: 'text-waiting' },
  cancelled: { label: 'Cancelled', dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
  dead_lettered: { label: 'Dead lettered', dot: 'bg-destructive', text: 'text-destructive' },
}

export function StatusDot({
  status,
  className,
}: {
  status: ExecutionStatus
  className?: string
}): JSX.Element {
  const c = statusConfig[status]
  return (
    <span className={cn('relative inline-flex size-1.5 rounded-full', c.dot, className)}>
      {c.pulse && (
        <span
          className={cn(
            'absolute inline-flex size-full animate-ping rounded-full opacity-60',
            c.dot,
          )}
        />
      )}
    </span>
  )
}

export function ExecutionStatusBadge({
  status,
  className,
}: {
  status: ExecutionStatus
  className?: string
}): JSX.Element {
  const c = statusConfig[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[11px] leading-none',
        c.text,
        className,
      )}
    >
      <StatusDot status={status} />
      {c.label}
    </span>
  )
}

const eventStatusColor: Record<EventStatus, string> = {
  success: 'text-success',
  failure: 'text-destructive',
  info: 'text-muted-foreground',
  warning: 'text-warning',
  running: 'text-info',
}

export function eventStatusTextClass(status: EventStatus): string {
  return eventStatusColor[status]
}
