import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  Gauge,
  Loader2,
  Play,
  RefreshCw,
  Skull,
  TimerOff,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DemoScenario } from "@/lib/mock-data";

const icons: Record<string, typeof Play> = {
  "check-circle": CheckCircle2,
  "refresh-cw": RefreshCw,
  gauge: Gauge,
  "timer-off": TimerOff,
  wallet: Wallet,
  skull: Skull,
  play: Play,
};

export function DemoScenarioCard({ scenario }: { scenario: DemoScenario }) {
  const [running, setRunning] = useState(false);
  const navigate = useNavigate();
  const Icon = icons[scenario.icon] ?? Play;

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      navigate({
        to: "/executions/$id",
        params: { id: scenario.targetExecutionId },
      });
    }, 1400);
  };

  return (
    <div className="panel flex flex-col p-4 transition-colors hover:border-ring/40">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-sm border border-border bg-muted text-primary">
          <Icon className="size-4" />
        </div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{scenario.name}</h3>
      </div>
      <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
        {scenario.description}
      </p>
      <div className="mt-3 rounded-sm border border-border bg-background/50 px-2.5 py-2">
        <div className="font-mono text-[9px] tracking-wider text-muted-foreground uppercase">
          Expected behavior
        </div>
        <div className="mt-0.5 font-mono text-[11px] leading-relaxed text-foreground/80">
          {scenario.expected}
        </div>
      </div>
      <button
        onClick={run}
        disabled={running}
        className={cn(
          "mt-4 inline-flex h-8 items-center justify-center gap-2 rounded-sm text-xs font-medium transition-colors",
          running
            ? "cursor-wait border border-border bg-muted text-muted-foreground"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {running ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            <span className="font-mono">executing…</span>
          </>
        ) : (
          <>
            <Play className="size-3.5" />
            Run Demo
          </>
        )}
      </button>
    </div>
  );
}
