import { cn } from "@/lib/utils";
import { fmtDuration, type TraceSpan } from "@/lib/mock-data";

function SpanRow({ span, total, depth }: { span: TraceSpan; total: number; depth: number }) {
  const left = (span.startMs / total) * 100;
  const width = Math.max(0.8, (span.durationMs / total) * 100);

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border/40 py-1.5 last:border-0">
        <div
          className="flex min-w-0 flex-1 items-center gap-2"
          style={{ paddingLeft: depth * 16 }}
        >
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              span.status === "error" ? "bg-destructive" : "bg-success",
            )}
          />
          <span className="truncate font-mono text-xs text-foreground">{span.name}</span>
          <span className="shrink-0 rounded-sm border border-border bg-muted px-1 font-mono text-[9px] text-muted-foreground">
            {span.service}
          </span>
        </div>
        <div className="relative hidden h-3.5 w-56 shrink-0 rounded-sm bg-muted/60 sm:block">
          <div
            className={cn(
              "absolute top-0 h-full rounded-sm",
              span.status === "error" ? "bg-destructive/70" : "bg-primary/60",
            )}
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        </div>
        <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
          {fmtDuration(span.durationMs)}
        </span>
      </div>
      {span.children?.map((c) => (
        <SpanRow key={c.id} span={c} total={total} depth={depth + 1} />
      ))}
    </>
  );
}

export function TraceTree({ root }: { root: TraceSpan }) {
  return (
    <div className="panel p-3">
      <div className="mb-2 flex items-center justify-between font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        <span>Span</span>
        <span className="hidden sm:block">Timeline</span>
      </div>
      <SpanRow span={root} total={root.durationMs} depth={0} />
    </div>
  );
}
