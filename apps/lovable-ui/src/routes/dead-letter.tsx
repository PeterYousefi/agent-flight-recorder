import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, Lock, Play, RotateCcw } from "lucide-react";
import { useState } from "react";
import {
  FAILURE_TYPES,
  deadLetters,
  fmtRelative,
  fmtTime,
} from "@/lib/mock-data";

export const Route = createFileRoute("/dead-letter")({
  head: () => ({
    meta: [
      { title: "Dead Letter — Agent Flight Recorder" },
      {
        name: "description",
        content:
          "Immutable records of executions that exhausted all retry attempts. Inspect, replay, or requeue as new executions.",
      },
      { property: "og:title", content: "Dead Letter — Agent Flight Recorder" },
      {
        property: "og:description",
        content: "Failure management for dead-lettered AI agent executions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DeadLetterPage,
});

function DeadLetterPage() {
  const navigate = useNavigate();
  const [requeued, setRequeued] = useState<Set<string>>(new Set());

  const requeue = (id: string) => {
    setRequeued((s) => new Set(s).add(id));
    setTimeout(() => {
      navigate({ to: "/executions/$id", params: { id: "exec_01J9XKG2TQ4W6Y8A0C2E4G6I8K0M2O" } });
    }, 900);
  };

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Dead Letter</h1>
        <p className="font-mono text-[11px] text-muted-foreground">
          {deadLetters.length} executions exhausted all retry attempts
        </p>
      </div>

      <div className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning/5 px-3.5 py-2.5">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-warning" />
        <p className="text-xs leading-relaxed text-foreground/80">
          Dead-lettered executions are <span className="font-medium text-foreground">immutable historical records</span>.
          They cannot be edited or resumed. Requeue creates a{" "}
          <span className="font-mono text-[11px] text-foreground">new execution</span> linked to the
          original — the record below never changes.
        </p>
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                <th className="px-3 py-2 font-medium">Execution</th>
                <th className="px-3 py-2 font-medium">Failure</th>
                <th className="px-3 py-2 text-right font-medium">Attempts</th>
                <th className="px-3 py-2 font-medium">Provider</th>
                <th className="px-3 py-2 font-medium">First failure</th>
                <th className="px-3 py-2 font-medium">Final failure</th>
                <th className="px-3 py-2 font-medium">Dead-lettered</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {deadLetters.map((d) => (
                <tr
                  key={d.executionId}
                  className="border-b border-border/50 transition-colors last:border-0 hover:bg-accent/40"
                >
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() =>
                        navigate({ to: "/executions/$id", params: { id: d.executionId } })
                      }
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {d.executionId.slice(0, 22)}…
                    </button>
                    <div className="font-mono text-[10px] text-muted-foreground">{d.agent}</div>
                  </td>
                  <td className="max-w-64 px-3 py-2.5">
                    <span className="rounded-sm border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] text-destructive">
                      {FAILURE_TYPES[d.failureType]}
                    </span>
                    <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground" title={d.failureMessage}>
                      {d.failureMessage}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-destructive">
                    {d.attempts}/3
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{d.provider}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] whitespace-nowrap text-muted-foreground" title={fmtTime(d.firstFailedAt)}>
                    {fmtRelative(d.firstFailedAt)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] whitespace-nowrap text-muted-foreground" title={fmtTime(d.finalFailedAt)}>
                    {fmtRelative(d.finalFailedAt)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] whitespace-nowrap text-foreground" title={fmtTime(d.deadLetteredAt)}>
                    {fmtRelative(d.deadLetteredAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() =>
                          navigate({ to: "/executions/$id", params: { id: d.executionId } })
                        }
                        className="inline-flex h-6 items-center gap-1 rounded-sm border border-input bg-card px-2 font-mono text-[10px] text-foreground hover:border-ring/60"
                      >
                        <Eye className="size-3" /> Inspect
                      </button>
                      <button
                        onClick={() =>
                          navigate({ to: "/executions/$id", params: { id: d.executionId } })
                        }
                        className="inline-flex h-6 items-center gap-1 rounded-sm border border-input bg-card px-2 font-mono text-[10px] text-foreground hover:border-ring/60"
                      >
                        <Play className="size-3" /> Replay
                      </button>
                      <button
                        onClick={() => requeue(d.executionId)}
                        disabled={requeued.has(d.executionId)}
                        className="inline-flex h-6 items-center gap-1 rounded-sm bg-primary px-2 font-mono text-[10px] text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
                      >
                        <RotateCcw className="size-3" />
                        {requeued.has(d.executionId) ? "Requeuing…" : "Requeue"}
                      </button>
                    </div>
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
