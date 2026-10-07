import { useState } from "react";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock,
  Cpu,
  ListPlus,
  Loader2,
  RefreshCw,
  Wallet,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDuration, type TimelineEvent, type TimelineEventType } from "@/lib/mock-data";
import { JSONViewer } from "./json-viewer";

const iconFor: Record<TimelineEventType, typeof Clock> = {
  created: ListPlus,
  queued: Clock,
  started: Loader2,
  model_request: Cpu,
  tool_call: CircleDot,
  retry_scheduled: RefreshCw,
  budget_warning: Wallet,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: Ban,
};

const railColor: Record<string, string> = {
  success: "border-success/60 bg-success/10 text-success",
  failure: "border-destructive/60 bg-destructive/10 text-destructive",
  warning: "border-warning/60 bg-warning/10 text-warning",
  running: "border-info/60 bg-info/10 text-info",
  info: "border-border bg-muted text-muted-foreground",
};

function EventRow({ event, startIso }: { event: TimelineEvent; startIso: string }) {
  const [open, setOpen] = useState(event.status === "failure");
  const Icon = iconFor[event.type];
  const ts = new Date(new Date(startIso).getTime() + event.offsetMs)
    .toISOString()
    .slice(11, 23);

  return (
    <div className="relative flex gap-3">
      {/* rail */}
      <div className="flex w-7 shrink-0 flex-col items-center">
        <div
          className={cn(
            "z-10 flex size-7 items-center justify-center rounded-full border",
            railColor[event.status],
          )}
        >
          <Icon className={cn("size-3.5", event.status === "running" && "animate-spin")} />
        </div>
        <div
          className={cn(
            "w-px flex-1",
            event.type === "retry_scheduled" ? "retry-connector" : "bg-border",
          )}
        />
      </div>

      {/* content */}
      <div className="min-w-0 flex-1 pb-5">
        <button
          onClick={() => event.details && setOpen(!open)}
          className={cn(
            "flex w-full items-center gap-2 rounded-sm text-left",
            event.details && "cursor-pointer",
          )}
        >
          <span
            className={cn(
              "font-mono text-[13px] font-medium",
              event.status === "failure" ? "text-destructive" : "text-foreground",
            )}
          >
            {event.label}
          </span>
          <span className="rounded-sm border border-border bg-muted px-1 py-px font-mono text-[9px] tracking-wide text-muted-foreground uppercase">
            attempt {event.attempt}
          </span>
          {event.durationMs !== undefined && (
            <span className="font-mono text-[11px] text-info">{fmtDuration(event.durationMs)}</span>
          )}
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">{ts}</span>
          {event.details && (
            <span className="text-muted-foreground">
              {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </span>
          )}
        </button>
        {event.meta && (
          <div
            className={cn(
              "mt-0.5 font-mono text-[11px]",
              event.status === "failure"
                ? "text-destructive/90"
                : event.status === "warning"
                  ? "text-warning/90"
                  : "text-muted-foreground",
            )}
          >
            {event.meta}
          </div>
        )}
        {open && event.details && (
          <JSONViewer data={event.details} className="mt-2" />
        )}
      </div>
    </div>
  );
}

export function FlightRecorder({
  events,
  startIso,
}: {
  events: TimelineEvent[];
  startIso: string;
}) {
  // group into attempts for visual separation
  const attempts = new Map<number, TimelineEvent[]>();
  for (const e of events) {
    const list = attempts.get(e.attempt) ?? [];
    list.push(e);
    attempts.set(e.attempt, list);
  }

  return (
    <div className="panel p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Flight Recorder
        </h3>
        <span className="font-mono text-[11px] text-muted-foreground">
          {events.length} events · {attempts.size} attempt{attempts.size > 1 ? "s" : ""}
        </span>
      </div>
      <div>
        {events.map((e, i) => (
          <div key={e.id} className={cn(i === events.length - 1 && "[&_.flex-1]:pb-0")}>
            <EventRow event={e} startIso={startIso} />
          </div>
        ))}
      </div>
    </div>
  );
}
