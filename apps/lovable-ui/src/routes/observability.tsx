import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Search } from "lucide-react";
import { MetricCard } from "@/components/console/metric-card";
import { StatusDot } from "@/components/console/status-badge";
import { executions, metricSeries } from "@/lib/mock-data";

export const Route = createFileRoute("/observability")({
  head: () => ({
    meta: [
      { title: "Observability — Agent Flight Recorder" },
      {
        name: "description",
        content:
          "Throughput, latency percentiles, provider errors, retries, dead-letter rate, queue depth, and a trace explorer for AI agent executions.",
      },
      { property: "og:title", content: "Observability — Agent Flight Recorder" },
      {
        property: "og:description",
        content: "Infrastructure-grade monitoring for AI agent execution.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ObservabilityPage,
});

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--foreground)",
} as const;

const axisTick = {
  fontSize: 10,
  fill: "var(--muted-foreground)",
  fontFamily: "var(--font-mono)",
} as const;

function Panel({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`panel p-4 ${className ?? ""}`}>
      <div className="mb-3">
        <h3 className="text-[13px] font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="font-mono text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      <div className="h-40">{children}</div>
    </div>
  );
}

function ObservabilityPage() {
  const [traceQuery, setTraceQuery] = useState("");

  const traces = executions.filter(
    (e) =>
      !traceQuery ||
      e.traceId.toLowerCase().includes(traceQuery.toLowerCase()) ||
      e.id.toLowerCase().includes(traceQuery.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Observability</h1>
        <p className="font-mono text-[11px] text-muted-foreground">
          env: local-dev · otel collector: connected · interval: 1h
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Throughput" value="68/h" delta="+9%" deltaDirection="up" deltaGood />
        <MetricCard label="Dead-letter rate" value="0.8%" delta="-0.3%" deltaDirection="down" deltaGood />
        <MetricCard label="Queue depth" value="7" hint="0 poison messages" />
        <MetricCard label="Tool invocations" value="1,912" hint="last 24h" />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Execution Throughput" subtitle="executions/hour">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metricSeries} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" tick={axisTick} tickLine={false} axisLine={false} interval={5} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="throughput" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} strokeWidth={1.5} name="throughput" />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Latency Percentiles" subtitle="p50 / p95 (ms)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={metricSeries} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" tick={axisTick} tickLine={false} axisLine={false} interval={5} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="p50" stroke="var(--info)" strokeWidth={1.5} dot={false} name="p50" />
              <Line type="monotone" dataKey="p95" stroke="var(--primary)" strokeWidth={1.5} dot={false} name="p95" />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Provider Errors" subtitle="4xx + 5xx from model providers">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={metricSeries} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" tick={axisTick} tickLine={false} axisLine={false} interval={5} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="providerErrors" fill="var(--destructive)" fillOpacity={0.7} radius={[2, 2, 0, 0]} name="errors" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Retries & Queue Depth" subtitle="retry count (line) · queue depth (area)">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metricSeries} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" tick={axisTick} tickLine={false} axisLine={false} interval={5} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="queueDepth" stroke="var(--warning)" fill="var(--warning)" fillOpacity={0.12} strokeWidth={1.5} name="queue depth" />
              <Line type="monotone" dataKey="retries" stroke="var(--primary)" strokeWidth={1.5} dot={false} name="retries" />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* Trace explorer */}
      <div className="panel">
        <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
          <div>
            <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
              Trace Explorer
            </h3>
            <p className="font-mono text-[11px] text-muted-foreground">
              search by trace or execution ID
            </p>
          </div>
          <div className="flex h-7 items-center gap-1.5 rounded-sm border border-input bg-card px-2">
            <Search className="size-3 text-muted-foreground" />
            <input
              value={traceQuery}
              onChange={(e) => setTraceQuery(e.target.value)}
              placeholder="trace_7f3a…"
              className="w-52 bg-transparent font-mono text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                <th className="px-3.5 py-2 font-medium">Status</th>
                <th className="px-3.5 py-2 font-medium">Trace ID</th>
                <th className="px-3.5 py-2 font-medium">Execution</th>
                <th className="px-3.5 py-2 font-medium">Service</th>
                <th className="px-3.5 py-2 text-right font-medium">Spans</th>
                <th className="px-3.5 py-2 text-right font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {traces.slice(0, 10).map((e) => (
                <tr key={e.id} className="border-b border-border/50 last:border-0 hover:bg-accent/40">
                  <td className="px-3.5 py-2">
                    <StatusDot status={e.status} />
                  </td>
                  <td className="px-3.5 py-2">
                    <Link
                      to="/executions/$id"
                      params={{ id: e.id }}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {e.traceId.slice(0, 26)}…
                    </Link>
                  </td>
                  <td className="px-3.5 py-2 font-mono text-xs text-muted-foreground">
                    {e.id.slice(0, 20)}…
                  </td>
                  <td className="px-3.5 py-2 font-mono text-[11px] text-muted-foreground">
                    orchestrator · {e.provider}
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono text-xs text-foreground">
                    {4 + e.tools.length * e.attempts + e.attempts}
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono text-xs text-foreground">
                    {e.durationMs ? `${(e.durationMs / 1000).toFixed(2)}s` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
