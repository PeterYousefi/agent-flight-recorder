import { cn } from "@/lib/utils";
import type { HealthState } from "@/lib/mock-data";

const stateConfig: Record<HealthState, { dot: string; label: string; text: string }> = {
  operational: { dot: "bg-success", label: "Operational", text: "text-success" },
  degraded: { dot: "bg-warning", label: "Degraded", text: "text-warning" },
  down: { dot: "bg-destructive", label: "Down", text: "text-destructive" },
};

export function HealthDot({ state, className }: { state: HealthState; className?: string }) {
  return (
    <span className={cn("inline-flex size-1.5 rounded-full", stateConfig[state].dot, className)} />
  );
}

export function HealthBadge({ state }: { state: HealthState }) {
  const c = stateConfig[state];
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-[11px]", c.text)}>
      <HealthDot state={state} />
      {c.label}
    </span>
  );
}
