import { createFileRoute } from "@tanstack/react-router";
import { Check, CloudOff, KeyRound, X } from "lucide-react";
import { HealthDot } from "@/components/console/health-indicator";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Agent Flight Recorder" },
      {
        name: "description",
        content:
          "Execution provider, budget defaults, local infrastructure status, and Azure deployment settings.",
      },
      { property: "og:title", content: "Settings — Agent Flight Recorder" },
      { property: "og:description", content: "Console configuration for Agent Flight Recorder." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ProviderOption({
  name,
  detail,
  configured,
  active,
}: {
  name: string;
  detail: string;
  configured: boolean;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-sm border px-3.5 py-3",
        active ? "border-primary/50 bg-primary/5" : "border-border bg-background/40",
      )}
    >
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-foreground">{name}</span>
          {active && (
            <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-primary uppercase">
              active
            </span>
          )}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{detail}</div>
      </div>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-mono text-[11px]",
          configured ? "text-success" : "text-muted-foreground",
        )}
      >
        {configured ? <Check className="size-3.5" /> : <X className="size-3.5" />}
        {configured ? "Configured" : "Not configured"}
      </span>
    </div>
  );
}

function BudgetField({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div>
      <label className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          defaultValue={value}
          className="h-8 w-full max-w-36 rounded-sm border border-input bg-background px-2.5 font-mono text-xs text-foreground outline-none focus:border-ring/60"
        />
        <span className="font-mono text-[11px] text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

function InfraRow({
  name,
  status,
  detail,
  ok,
}: {
  name: string;
  status: string;
  detail: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-2.5 last:border-0">
      <div>
        <div className="text-[13px] font-medium text-foreground">{name}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{detail}</div>
      </div>
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
        <HealthDot state={ok ? "operational" : "degraded"} />
        <span className={ok ? "text-success" : "text-warning"}>{status}</span>
      </span>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="font-mono text-[11px] text-muted-foreground">env: local-dev</p>
      </div>

      <Section
        title="Execution Provider"
        description="Where agent executions are routed. API keys are never displayed."
      >
        <div className="space-y-2">
          <ProviderOption
            name="Mock Provider"
            detail="deterministic local responses · $0 cost"
            configured
            active
          />
          <ProviderOption
            name="Sapiom"
            detail="sap-prod-us-east · key stored in environment"
            configured
            active={false}
          />
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-sm border border-border bg-background/40 px-3 py-2">
          <KeyRound className="size-3.5 text-muted-foreground" />
          <span className="font-mono text-[11px] text-muted-foreground">
            Credentials are referenced by name and never shown in this console.
          </span>
        </div>
      </Section>

      <Section
        title="Budget Defaults"
        description="Guardrails applied to every new execution unless overridden."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <BudgetField label="Max cost" value="0.05" unit="USD / exec" />
          <BudgetField label="Max attempts" value="3" unit="retries" />
          <BudgetField label="Max duration" value="120" unit="seconds" />
          <BudgetField label="Max tool calls" value="12" unit="per exec" />
        </div>
        <button className="mt-4 inline-flex h-7 items-center rounded-sm bg-primary px-3 font-mono text-[11px] text-primary-foreground hover:bg-primary/90">
          Save defaults
        </button>
      </Section>

      <Section
        title="Local Infrastructure"
        description="Status of the local development stack. Display only."
      >
        <div>
          <InfraRow name="Service Bus Emulator" status="Running" detail="localhost:5672 · queue: default" ok />
          <InfraRow name="Azurite" status="Degraded" detail="localhost:10000 · latency elevated (212ms)" ok={false} />
          <InfraRow name="PostgreSQL" status="Running" detail="localhost:5432 · 14 connections" ok />
          <InfraRow name="OpenTelemetry" status="Running" detail="localhost:4317 · 100% spans exported" ok />
        </div>
      </Section>

      <Section
        title="Azure Deployment"
        description="Optional managed deployment of the recorder stack."
      >
        <div className="flex items-start gap-2.5 rounded-sm border border-border bg-background/40 px-3.5 py-3">
          <CloudOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[13px] font-medium text-foreground">
              Local development uses $0 Azure resources.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Real Azure deployment is <span className="font-medium text-foreground">disabled</span> in
              this environment. Provisioning infrastructure requires an explicit, reviewed deployment
              pipeline — it is never triggered from this console.
            </p>
            <span className="mt-2 inline-block rounded-sm border border-border bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
              deployment: disabled
            </span>
          </div>
        </div>
      </Section>
    </div>
  );
}
