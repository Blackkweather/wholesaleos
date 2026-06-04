import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, DollarSign, Target, Trophy } from "lucide-react";
import type { Analytics } from "@/lib/data/analytics";

/**
 * Phase 1 KPI widgets — revenue + conversion funnel.
 * Optimizes the operator's attention toward contracts & fees, not lead count.
 */
export function RevenueKpis({ a }: { a: Analytics }) {
  const cards = [
    { label: "Revenue (closed)", value: formatCurrency(a.revenue.total), icon: DollarSign, tone: "text-[#00ff87]" },
    { label: "Avg assignment fee", value: formatCurrency(a.revenue.avgAssignmentFee), icon: Trophy, tone: "text-[#00ff87]" },
    { label: "Pipeline value", value: formatCurrency(a.revenue.pipeline, { compact: true }), icon: TrendingUp, tone: "text-white" },
    { label: "Deals closed", value: String(a.totals.closed), icon: Target, tone: "text-white" },
  ];

  const funnel = [
    { label: "Found", value: a.funnel.found },
    { label: "Contacted", value: a.funnel.contacted },
    { label: "Responded", value: a.funnel.responded },
    { label: "Interested", value: a.funnel.interested },
    { label: "Contract", value: a.funnel.contractSigned },
    { label: "Closed", value: a.funnel.closed },
  ];
  const max = Math.max(1, ...funnel.map((f) => f.value));

  const rates = [
    { label: "Lead → Response", value: a.rates.leadToResponse },
    { label: "Response → Contract", value: a.rates.responseToContract },
    { label: "Contract → Close", value: a.rates.contractToClose },
  ];

  return (
    <div className="space-y-4">
      {/* Revenue cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <c.icon className="h-3.5 w-3.5" /> {c.label}
            </div>
            <div className={`mt-1 font-heading text-2xl tracking-wide ${c.tone}`}>{c.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Conversion funnel */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="font-heading text-lg tracking-wide">Conversion Funnel</h3>
          <p className="mb-3 text-xs text-muted-foreground">How far your leads actually progress</p>
          <div className="space-y-2">
            {funnel.map((f) => (
              <div key={f.label} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-sm text-muted-foreground">{f.label}</div>
                <div className="h-6 flex-1 overflow-hidden rounded bg-muted/40">
                  <div
                    className="flex h-full items-center justify-end rounded bg-primary/70 px-2 text-xs font-semibold text-primary-foreground transition-all"
                    style={{ width: `${Math.max(6, (f.value / max) * 100)}%` }}
                  >
                    {f.value}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Conversion rates */}
        <Card className="p-5">
          <h3 className="font-heading text-lg tracking-wide">Conversion Rates</h3>
          <p className="mb-3 text-xs text-muted-foreground">The numbers that make money</p>
          <div className="space-y-4">
            {rates.map((r) => (
              <div key={r.label}>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">{r.label}</span>
                  <span className="font-heading text-xl tracking-wide text-[#00ff87]">{r.value}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted/40">
                  <div className="h-full rounded bg-[#00ff87]/70" style={{ width: `${Math.min(100, r.value)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
