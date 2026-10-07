import type { JSX } from 'react'
import { cn } from '@/lib/utils'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: string
  delta?: string
  deltaDirection?: 'up' | 'down' | 'flat'
  deltaGood?: boolean
  hint?: string
  className?: string
}

export function MetricCard({
  label,
  value,
  delta,
  deltaDirection = 'flat',
  deltaGood,
  hint,
  className,
}: MetricCardProps): JSX.Element {
  const DeltaIcon =
    deltaDirection === 'up' ? TrendingUp : deltaDirection === 'down' ? TrendingDown : Minus
  const deltaColor =
    deltaGood === undefined
      ? 'text-muted-foreground'
      : deltaGood
        ? 'text-success'
        : 'text-destructive'

  return (
    <div className={cn('panel px-3.5 py-3', className)}>
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1.5 font-mono text-xl font-semibold tracking-tight text-foreground">
        {value}
      </div>
      {(delta || hint) && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px]">
          {delta && (
            <span className={cn('inline-flex items-center gap-0.5 font-mono', deltaColor)}>
              <DeltaIcon className="size-3" />
              {delta}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  )
}
