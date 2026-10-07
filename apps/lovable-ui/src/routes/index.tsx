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
import { ArrowRight } from "lucide-react";
import { MetricCard } from "@/components/console/metric-card";
import { ExecutionTable } from "@/components/console/execution-table";
import { HealthBadge } from "@/components/console/health-indicator";
import { executions, healthServices, metricSeries } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — Agent Flight Recorder" },
      {
        name: "description",
        content:
          "Operations dashboard for autonomous AI agents: executions, success rate, latency, cost, retries, and system health.",
      },
      { property: "og:title", content: "Overview — Agent Flight Recorder" },
      {
        property: "og:description",
        content: "Operations dashboard for autonomous AI agent executions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OverviewPage,
});

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--foreground)",
} as const;

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel p-4">
      <div className="mb-3">
        <h3 className="text-[13px] font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="font-mono text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      <div className="h-44">{children}</div>
    </div>
  );
}

function OverviewPage() {
  const completed = executions.filter((e) => e.status === "completed").length;
  const failed = executions.filter(
    (e) => e.status === "failed" || e.status === "dead_lettered",
  ).length;
  const total = executions.length;
  const retries = executions.reduce((n, e) => n + Math.max(0, e.attempts - 1), 0);
  const cost = executions.reduce((n, e) => n + e.costUsd, 0);
  const durations = executions
    .filter((e) => e.durationMs > 0)
    .map((e) => e.durationMs)
    .sort((a, b) => a - b);
  const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Overview</h1>
          <p className="font-mono text-[11px] text-muted-foreground">
            env: local-dev · last 24h · updated just now
          </p>
        </div>
        <Link
          to="/executions"
          className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
        >
          all executions <ArrowRight className="size-3" />
        </Link>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
        <MetricCard label="Executions" value={String(total)} delta="+12%" deltaDirection="up" deltaGood hint="vs prev 24h" />
        <MetricCard
          label="Success Rate"
          value={`${((completed / total) * 100).toFixed(1)}%`}
          delta="+2.1%"
          deltaDirection="up"
          deltaGood
        />
        <MetricCard
          label="Failure Rate"
          value={`${((failed / total) * 100).toFixed(1)}%`}
          delta="-1.4%"
          deltaDirection="down"
          deltaGood
        />
        <MetricCard label="P95 Latency" value={`${(p95 / 1000).toFixed(2)}s`} delta="+340ms" deltaDirection="up" deltaGood={false} />
        <MetricCard label="Est. Cost" value={`$${cost.toFixed(2)}`} hint="of $25.00 budget" />
        <MetricCard label="Retries" value={String(retries)} delta="-3" deltaDirection="down" deltaGood />
        <MetricCard label="Dead Letters" value={String(failed)} hint="6 in queue" deltaGood={false} />
      </div>

      {/* Charts */}
      <div className="grid gap-3 xl:grid-cols-3">
        <ChartCard title="Execution Activity" subtitle="executions/hour by outcome">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metricSeries} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} interval={5} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="succeeded" stackId="1" stroke="var(--success)" fill="var(--success)" fillOpacity={0.18} strokeWidth={1.5} name="succeeded" />
              <Area type="monotone" dataKey="failed" stackId="1" stroke="var(--destructive)" fill="var(--destructive)" fillOpacity={0.25} strokeWidth={1.5} name="failed" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Latency" subtitle="p50 / p95 execution latency (ms)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={metricSeries} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} interval={5} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="p50" stroke="var(--info)" strokeWidth={1.5} dot={false} name="p50" />
              <Line type="monotone" dataKey="p95" stroke="var(--primary)" strokeWidth={1.5} dot={false} name="p95" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Cost" subtitle="estimated execution cost ($/hour)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={metricSeries} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} interval={5} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="cost" fill="var(--primary)" fillOpacity={0.75} radius={[2, 2, 0, 0]} name="cost ($)" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {/* Recent executions */}
        <div className="xl:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
              Recent Executions
            </h3>
            <Link
              to="/executions"
              className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
            >
              view all <ArrowRight className="size-3" />
            </Link>
          </div>
          <ExecutionTable executions={executions.slice(0, 7)} compact />
        </div>

        {/* System health */}
        <div>
          <h3 className="mb-2 text-[13px] font-semibold tracking-tight text-foreground">
            System Health
          </h3>
          <div className="panel divide-y divide-border/60">
            {healthServices.map((s) => (
              <div key={s.name} className="flex items-center justify-between px-3.5 py-2.5">
                <div>
                  <div className="text-[13px] font-medium text-foreground">{s.name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{s.detail}</div>
                </div>
                <HealthBadge state={s.state} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
