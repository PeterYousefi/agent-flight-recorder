import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { ExecutionTable } from "@/components/console/execution-table";
import {
  FAILURE_TYPES,
  PROVIDERS,
  executions,
  type ExecutionStatus,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/executions/")({
  head: () => ({
    meta: [
      { title: "Executions — Agent Flight Recorder" },
      {
        name: "description",
        content:
          "Filter, search, and inspect every AI agent execution: status, provider, latency, cost, attempts, and tools.",
      },
      { property: "og:title", content: "Executions — Agent Flight Recorder" },
      { property: "og:description", content: "Operations table for AI agent executions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExecutionsPage,
});

const selectClass =
  "h-7 rounded-sm border border-input bg-card px-2 font-mono text-[11px] text-foreground outline-none focus:border-ring/60";

const STATUSES: { id: ExecutionStatus; label: string }[] = [
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
  { id: "running", label: "Running" },
  { id: "retrying", label: "Retrying" },
  { id: "waiting", label: "Waiting" },
  { id: "cancelled", label: "Cancelled" },
];

function ExecutionsPage() {
  const [status, setStatus] = useState<string>("all");
  const [provider, setProvider] = useState<string>("all");
  const [range, setRange] = useState<string>("24h");
  const [failure, setFailure] = useState<string>("all");
  const [minLatency, setMinLatency] = useState<string>("");
  const [replayedOnly, setReplayedOnly] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const minMs = minLatency ? Number(minLatency) * 1000 : 0;
    const rangeMs =
      range === "1h" ? 3_600_000 : range === "6h" ? 21_600_000 : range === "24h" ? 86_400_000 : Infinity;
    const now = Date.parse("2026-10-07T15:58:00Z");
    return executions.filter((e) => {
      if (status !== "all" && e.status !== status) return false;
      if (provider !== "all" && e.provider !== provider) return false;
      if (failure !== "all" && e.failureType !== failure) return false;
      if (minMs && e.durationMs < minMs) return false;
      if (replayedOnly && !e.replayOf) return false;
      if (now - Date.parse(e.startedAt) > rangeMs) return false;
      if (query && !e.id.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [status, provider, range, failure, minLatency, replayedOnly, query]);

  const hasFilters =
    status !== "all" ||
    provider !== "all" ||
    failure !== "all" ||
    minLatency !== "" ||
    replayedOnly ||
    query !== "";

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Executions</h1>
          <p className="font-mono text-[11px] text-muted-foreground">
            {filtered.length} of {executions.length} executions · env: local-dev
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="panel flex flex-wrap items-center gap-2 p-2.5">
        <div className="flex h-7 items-center gap-1.5 rounded-sm border border-input bg-card px-2">
          <Search className="size-3 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="exec_01J9…"
            className="w-44 bg-transparent font-mono text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
          <option value="all">Status: all</option>
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <select value={provider} onChange={(e) => setProvider(e.target.value)} className={selectClass}>
          <option value="all">Provider: all</option>
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        <select value={range} onChange={(e) => setRange(e.target.value)} className={selectClass}>
          <option value="1h">Last 1h</option>
          <option value="6h">Last 6h</option>
          <option value="24h">Last 24h</option>
          <option value="all">All time</option>
        </select>

        <select value={failure} onChange={(e) => setFailure(e.target.value)} className={selectClass}>
          <option value="all">Failure: all</option>
          {Object.entries(FAILURE_TYPES).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>

        <input
          value={minLatency}
          onChange={(e) => setMinLatency(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="Min latency (s)"
          className={cn(selectClass, "w-28")}
        />

        <label className="flex h-7 cursor-pointer items-center gap-1.5 rounded-sm border border-input bg-card px-2 font-mono text-[11px] text-foreground">
          <input
            type="checkbox"
            checked={replayedOnly}
            onChange={(e) => setReplayedOnly(e.target.checked)}
            className="size-3 accent-[var(--primary)]"
          />
          Replayed
        </label>

        {hasFilters && (
          <button
            onClick={() => {
              setStatus("all");
              setProvider("all");
              setFailure("all");
              setMinLatency("");
              setReplayedOnly(false);
              setQuery("");
            }}
            className="inline-flex h-7 items-center gap-1 rounded-sm px-2 font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" /> Clear
          </button>
        )}
      </div>

      <ExecutionTable executions={filtered} />
    </div>
  );
}
