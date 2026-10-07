import type { JSX } from 'react'
import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

function JsonValue({ value, depth }: { value: unknown; depth: number }): JSX.Element {
  if (value === null) return <span className="text-muted-foreground italic">null</span>
  if (typeof value === 'boolean')
    return <span className="text-warning">{value ? 'true' : 'false'}</span>
  if (typeof value === 'number') return <span className="text-info">{value}</span>
  if (typeof value === 'string') return <span className="text-success">"{value}"</span>
  return <JsonNode value={value as Record<string, unknown>} depth={depth} />
}

function JsonNode({ value, depth }: { value: unknown; depth: number }): JSX.Element {
  const [open, setOpen] = useState(depth < 2)
  const isArray = Array.isArray(value)
  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>)

  if (entries.length === 0) {
    return <span className="text-muted-foreground">{isArray ? '[]' : '{}'}</span>
  }

  return (
    <span>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-0.5 rounded-sm text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span>{isArray ? `[${entries.length}]` : `{${entries.length}}`}</span>
      </button>
      {open && (
        <span className="block border-l border-border pl-4" style={{ marginLeft: 6 }}>
          {entries.map(([k, v]) => (
            <span key={k} className="block leading-5">
              <span className="text-primary">{k}</span>
              <span className="text-muted-foreground">: </span>
              <JsonValue value={v} depth={depth + 1} />
            </span>
          ))}
        </span>
      )}
    </span>
  )
}

export function JSONViewer({
  data,
  className,
}: {
  data: unknown
  className?: string
}): JSX.Element {
  return (
    <div
      className={cn(
        'overflow-auto rounded-md border border-border bg-background/60 p-3 font-mono text-xs',
        className,
      )}
    >
      <JsonNode value={data} depth={0} />
    </div>
  )
}
