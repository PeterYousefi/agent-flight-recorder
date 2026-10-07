import type { JSX } from 'react'
import { Link } from '@tanstack/react-router'
import { fmtCost, fmtDuration, fmtRelative, type Execution } from '@/lib/data'
import { ExecutionStatusBadge } from './status-badge'
import { cn } from '@/lib/utils'

interface ExecutionTableProps {
  executions: Execution[]
  compact?: boolean
}

export function ExecutionTable({ executions: rows, compact }: ExecutionTableProps): JSX.Element {
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Execution</th>
              {!compact && <th className="px-3 py-2 font-medium">Agent</th>}
              <th className="px-3 py-2 font-medium">Provider</th>
              <th className="px-3 py-2 text-right font-medium">Duration</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 text-right font-medium">Attempts</th>
              {!compact && <th className="px-3 py-2 font-medium">Operation</th>}
              <th className="px-3 py-2 text-right font-medium">Started</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr
                key={e.id}
                className="group border-b border-border/50 transition-colors last:border-0 hover:bg-accent/40"
              >
                <td className="px-3 py-2">
                  <ExecutionStatusBadge status={e.status} />
                </td>
                <td className="px-3 py-2">
                  <Link
                    to="/executions/$id"
                    params={{ id: e.id }}
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {e.id.replace('exec_', 'exec_…').slice(0, 18)}…
                  </Link>
                  {e.replayOf && (
                    <span className="ml-1.5 rounded-sm border border-border bg-muted px-1 font-mono text-[9px] text-muted-foreground">
                      replay
                    </span>
                  )}
                </td>
                {!compact && <td className="px-3 py-2 text-foreground">{e.agent}</td>}
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{e.provider}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-foreground">
                  {fmtDuration(e.durationMs)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-foreground">
                  {fmtCost(e.measuredCostUsd ?? e.estimatedCostUsd)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  <span className={cn(e.attempts > 1 ? 'text-warning' : 'text-muted-foreground')}>
                    {e.attempts}/{e.maxAttempts ?? '—'}
                  </span>
                </td>
                {!compact && (
                  <td className="max-w-40 px-3 py-2">
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {e.operation}
                    </span>
                  </td>
                )}
                <td className="px-3 py-2 text-right font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                  {fmtRelative(e.startedAt)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-10 text-center font-mono text-xs text-muted-foreground"
                >
                  No executions match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
