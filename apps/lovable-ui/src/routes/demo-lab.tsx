import { createFileRoute } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";
import { DemoScenarioCard } from "@/components/console/demo-scenario-card";
import { demoScenarios } from "@/lib/mock-data";

export const Route = createFileRoute("/demo-lab")({
  head: () => ({
    meta: [
      { title: "Demo Lab — Agent Flight Recorder" },
      {
        name: "description",
        content:
          "Run scripted failure and recovery scenarios — transient failures, rate limits, timeouts, budgets, dead letters, and replays — against the mock provider.",
      },
      { property: "og:title", content: "Demo Lab — Agent Flight Recorder" },
      {
        property: "og:description",
        content: "Scripted execution scenarios for demonstrating agent observability.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DemoLabPage,
});

function DemoLabPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 items-center justify-center rounded-sm border border-border bg-card text-primary">
          <FlaskConical className="size-4" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Demo Lab</h1>
          <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            Scripted scenarios that run against the{" "}
            <span className="font-mono text-xs text-foreground">mock provider</span>. Each run
            produces a real recorded execution — follow it into the Flight Recorder to inspect the
            timeline, trace, and cost. No external API calls, no spend.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {demoScenarios.map((s) => (
          <DemoScenarioCard key={s.id} scenario={s} />
        ))}
      </div>
    </div>
  );
}
