import type { CostRow } from "@/lib/mock-data";

export function CostBreakdown({
  rows,
  total,
  budget,
}: {
  rows: CostRow[];
  total: number;
  budget: number;
}) {
  const pct = Math.min(100, (total / budget) * 100);
  const over = total > budget;

  return (
    <div className="space-y-4">
      <div className="panel overflow-hidden">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Detail</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.item} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-2 text-foreground">{r.item}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.detail}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-foreground">
                  ${r.costUsd.toFixed(4)}
                </td>
              </tr>
            ))}
            <tr className="bg-muted/40">
              <td className="px-3 py-2 font-medium text-foreground">Execution total</td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-foreground">
                ${total.toFixed(4)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="panel p-3.5">
        <div className="flex items-center justify-between font-mono text-[11px]">
          <span className="tracking-wider text-muted-foreground uppercase">Budget consumed</span>
          <span className={over ? "text-destructive" : "text-foreground"}>
            ${total.toFixed(4)} / ${budget.toFixed(2)} · {pct.toFixed(1)}%
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={over ? "h-full bg-destructive" : "h-full bg-primary"}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
