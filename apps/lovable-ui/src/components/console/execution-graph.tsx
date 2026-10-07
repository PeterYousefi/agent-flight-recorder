import { cn } from "@/lib/utils";
import { fmtDuration, type TimelineEvent } from "@/lib/mock-data";

interface GraphNode {
  key: string;
  label: string;
  sub?: string | undefined;
  status: "success" | "failure" | "warning" | "running" | "info";
  col: number;
  row: number;
}

interface GraphEdge {
  from: string;
  to: string;
  retry?: boolean;
}

const COL_W = 230;
const ROW_H = 66;
const NODE_W = 190;
const NODE_H = 44;

const borderByStatus: Record<string, string> = {
  success: "border-success/50",
  failure: "border-destructive/60",
  warning: "border-warning/50",
  running: "border-info/50",
  info: "border-border",
};

const dotByStatus: Record<string, string> = {
  success: "bg-success",
  failure: "bg-destructive",
  warning: "bg-warning",
  running: "bg-info",
  info: "bg-muted-foreground",
};

export function ExecutionGraph({ events }: { events: TimelineEvent[] }) {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  nodes.push({ key: "root", label: "Execution", sub: "orchestrator", status: "info", col: 0, row: 0 });

  let prevKey = "root";
  let prevAttempt = 0;
  let row = 1;
  const attemptCols = new Map<number, number>();

  for (const e of events) {
    if (e.type === "created" || e.type === "queued") continue;
    if (!attemptCols.has(e.attempt)) attemptCols.set(e.attempt, attemptCols.size + 1);
    const col = attemptCols.get(e.attempt)!;
    if (e.attempt !== prevAttempt) {
      row = 1;
      prevAttempt = e.attempt;
    }
    const key = e.id;
    nodes.push({
      key,
      label: e.label,
      sub: e.durationMs !== undefined ? fmtDuration(e.durationMs) : e.meta,
      status: e.status,
      col,
      row: row++,
    });
    edges.push({ from: prevKey, to: key, retry: e.type === "started" && e.attempt > 1 });
    if (e.type === "retry_scheduled") {
      // visual only: edge to next attempt start handled when it appears
    }
    prevKey = key;
  }

  const width = (attemptCols.size + 1) * COL_W + 40;
  const height = Math.max(...nodes.map((n) => n.row)) * ROW_H + 80;

  const nodeByKey = new Map(nodes.map((n) => [n.key, n]));
  const cx = (n: GraphNode) => 20 + n.col * COL_W + NODE_W / 2;
  const cy = (n: GraphNode) => 20 + n.row * ROW_H + NODE_H / 2;

  return (
    <div className="panel overflow-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Execution Graph
        </h3>
        <span className="font-mono text-[11px] text-muted-foreground">
          {nodes.length} nodes · {edges.length} edges
        </span>
      </div>
      <div className="relative" style={{ width, height }}>
        <svg className="absolute inset-0" width={width} height={height}>
          {edges.map((edge, i) => {
            const a = nodeByKey.get(edge.from)!;
            const b = nodeByKey.get(edge.to)!;
            const x1 = cx(a);
            const y1 = cy(a) + NODE_H / 2;
            const x2 = cx(b);
            const y2 = cy(b) - NODE_H / 2;
            const midY = (y1 + y2) / 2;
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                fill="none"
                stroke={edge.retry ? "var(--warning)" : "var(--border)"}
                strokeWidth={edge.retry ? 1.5 : 1}
                strokeDasharray={edge.retry ? "4 3" : undefined}
              />
            );
          })}
        </svg>
        {nodes.map((n) => (
          <div
            key={n.key}
            className={cn(
              "absolute flex flex-col justify-center rounded-sm border bg-card px-2.5",
              borderByStatus[n.status],
            )}
            style={{
              left: 20 + n.col * COL_W + (COL_W - NODE_W) / 2,
              top: 20 + n.row * ROW_H,
              width: NODE_W,
              height: NODE_H,
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className={cn("size-1.5 shrink-0 rounded-full", dotByStatus[n.status])} />
              <span className="truncate font-mono text-[11px] font-medium text-foreground">
                {n.label}
              </span>
            </div>
            {n.sub && (
              <span className="truncate pl-3 font-mono text-[10px] text-muted-foreground">
                {n.sub}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
