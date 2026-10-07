import { useMemo, useState } from "react";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  Ban,
  Copy,
  FileDown,
  Play,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FEATURED_EXECUTION_ID,
  buildArtifacts,
  buildCost,
  buildLogs,
  buildRawJson,
  buildTimeline,
  buildTrace,
  executions,
  featuredTimeline,
  fmtCost,
  fmtDuration,
  fmtTime,
} from "@/lib/mock-data";
import { ExecutionStatusBadge } from "@/components/console/status-badge";
import { FlightRecorder } from "@/components/console/flight-recorder";
import { ExecutionGraph } from "@/components/console/execution-graph";
import { CostBreakdown } from "@/components/console/cost-breakdown";
import { TraceTree } from "@/components/console/trace-tree";
import { JSONViewer } from "@/components/console/json-viewer";

export const Route = createFileRoute("/executions/$id")({
  loader: ({ params }) => {
    const execution = executions.find((e) => e.id === params.id);
    if (!execution) throw notFound();
    return { execution };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.execution.id ?? "Execution"} — Agent Flight Recorder` },
      {
        name: "description",
        content: `Flight recorder timeline, trace, cost, logs, and artifacts for execution ${loaderData?.execution.id ?? ""}.`,
      },
      { property: "og:title", content: "Execution detail — Agent Flight Recorder" },
      {
        property: "og:description",
        content: "Replay and inspect a recorded AI agent execution.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExecutionDetailPage,
});

const TABS = ["Events", "Logs", "Cost", "Artifacts", "Trace", "Raw"] as const;
type Tab = (typeof TABS)[number];

const levelColor: Record<string, string> = {
  debug: "text-muted-foreground",
  info: "text-info",
  warn: "text-warning",
  error: "text-destructive",
};

function MetaField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9px] tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div className={cn("truncate text-[13px] text-foreground", mono && "font-mono text-xs")}>
        {value}
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  disabled,
  title,
}: {
  icon: typeof Play;
  label: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-sm border px-2.5 font-mono text-[11px] transition-colors",
        disabled
          ? "cursor-not-allowed border-border text-muted-foreground/50"
          : "border-input bg-card text-foreground hover:border-ring/60 hover:bg-accent",
      )}
    >
      <Icon className="size-3" />
      {label}
    </button>
  );
}

function ExecutionDetailPage() {
  const { execution } = Route.useLoaderData();
  const [view, setView] = useState<"timeline" | "graph">("timeline");
  const [tab, setTab] = useState<Tab>("Events");
  const [copied, setCopied] = useState(false);

  const events = useMemo(
    () => (execution.id === FEATURED_EXECUTION_ID ? featuredTimeline : buildTimeline(execution)),
    [execution],
  );
  const logs = useMemo(() => buildLogs(execution, events), [execution, events]);
  const cost = useMemo(() => buildCost(execution), [execution]);
  const artifacts = useMemo(() => buildArtifacts(execution), [execution]);
  const trace = useMemo(() => buildTrace(execution, events), [execution, events]);
  const raw = useMemo(() => buildRawJson(execution, events), [execution, events]);

  const canCancel = execution.status === "running" || execution.status === "waiting" || execution.status === "retrying";
  const canRetry = execution.status === "failed";
  const canReplay = execution.status === "completed" || execution.status === "failed";

  const copyId = () => {
    navigator.clipboard?.writeText(execution.id).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <Link
          to="/executions"
          className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> executions
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          <h1 className="font-mono text-base font-semibold tracking-tight text-foreground">
            {execution.id}
          </h1>
          <button
            onClick={copyId}
            className="text-muted-foreground transition-colors hover:text-foreground"
            title="Copy execution ID"
          >
            <Copy className="size-3.5" />
          </button>
          {copied && <span className="font-mono text-[10px] text-success">copied</span>}
          <ExecutionStatusBadge status={execution.status} />
          {execution.replayOf && (
            <Link
              to="/executions/$id"
              params={{ id: execution.replayOf }}
              className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
            >
              replay of {execution.replayOf.slice(0, 20)}…
            </Link>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {canCancel && <ActionButton icon={Ban} label="Cancel" />}
            {canRetry && <ActionButton icon={RefreshCw} label="Retry" />}
            {canReplay && <ActionButton icon={Play} label="Replay" />}
            {!canCancel && !canRetry && !canReplay && (
              <span className="font-mono text-[10px] text-muted-foreground">
                no actions available for this state
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Metadata strip */}
      <div className="panel grid grid-cols-2 gap-x-4 gap-y-3 p-3.5 sm:grid-cols-4 xl:grid-cols-8">
        <MetaField label="Agent" value={execution.agent} mono={false} />
        <MetaField label="Provider" value={`${execution.provider} · ${execution.model}`} />
        <MetaField label="Attempts" value={`${execution.attempts} / ${execution.maxAttempts}`} />
        <MetaField label="Started" value={fmtTime(execution.startedAt)} />
        <MetaField label="Duration" value={fmtDuration(execution.durationMs)} />
        <MetaField label="Est. cost" value={fmtCost(execution.costUsd)} />
        <div className="col-span-2 min-w-0">
          <div className="font-mono text-[9px] tracking-wider text-muted-foreground uppercase">
            Trace ID
          </div>
          <div className="truncate font-mono text-xs text-primary">{execution.traceId}</div>
        </div>
      </div>

      {execution.failureMessage && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5">
          <span className="font-mono text-xs text-destructive">{execution.failureMessage}</span>
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center gap-1">
        {(["timeline", "graph"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "h-7 rounded-sm px-3 font-mono text-[11px] capitalize transition-colors",
              view === v
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v}
          </button>
        ))}
      </div>

      {view === "timeline" ? (
        <FlightRecorder events={events} startIso={execution.startedAt} />
      ) : (
        <ExecutionGraph events={events} />
      )}

      {/* Detail tabs */}
      <div>
        <div className="flex gap-0.5 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "relative px-3 py-2 font-mono text-[11px] transition-colors",
                tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
              {tab === t && <span className="absolute inset-x-2 -bottom-px h-px bg-primary" />}
            </button>
          ))}
        </div>

        <div className="pt-3">
          {tab === "Events" && (
            <div className="panel overflow-hidden">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                    <th className="px-3 py-2 font-medium">Event</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Attempt</th>
                    <th className="px-3 py-2 text-right font-medium">Offset</th>
                    <th className="px-3 py-2 text-right font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-1.5 font-mono text-xs text-foreground">{e.label}</td>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                        {e.type}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                        {e.attempt}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-[11px] text-muted-foreground">
                        +{e.offsetMs === 0 ? "0ms" : fmtDuration(e.offsetMs)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-[11px] text-foreground">
                        {e.durationMs !== undefined ? fmtDuration(e.durationMs) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "Logs" && (
            <div className="panel overflow-hidden">
              <div className="max-h-96 overflow-auto p-2 font-mono text-[11px] leading-5">
                {logs.map((l, i) => (
                  <div key={i} className="flex gap-3 rounded-sm px-1.5 py-0.5 hover:bg-accent/40">
                    <span className="shrink-0 text-muted-foreground">{l.ts.slice(11, 23)}</span>
                    <span className={cn("w-10 shrink-0 uppercase", levelColor[l.level])}>
                      {l.level}
                    </span>
                    <span className="w-24 shrink-0 text-muted-foreground">{l.source}</span>
                    <span className="text-foreground/90">{l.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "Cost" && (
            <CostBreakdown rows={cost.rows} total={execution.costUsd} budget={cost.budgetUsd} />
          )}

          {tab === "Artifacts" && (
            <div className="panel overflow-hidden">
              {artifacts.length === 0 ? (
                <div className="px-3 py-10 text-center font-mono text-xs text-muted-foreground">
                  No artifacts — the execution did not complete.
                </div>
              ) : (
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                      <th className="px-3 py-2 font-medium">Artifact</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 text-right font-medium">Size</th>
                      <th className="px-3 py-2 text-right font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {artifacts.map((a) => (
                      <tr key={a.id} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2 font-mono text-xs text-foreground">{a.name}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                          {a.kind}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[11px] text-muted-foreground">
                          {a.size}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline">
                            <FileDown className="size-3" /> download
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "Trace" && <TraceTree root={trace} />}

          {tab === "Raw" && <JSONViewer data={raw} className="max-h-[32rem]" />}
        </div>
      </div>
    </div>
  );
}
