import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Clock, Flame, FileSignature, Send, Handshake } from "lucide-react";
import type { Analytics } from "@/lib/data/analytics";
import type { DispoSummary } from "@/lib/data/disposition";

interface Priorities {
  overdueFollowUps: number;
  hotLeads: { id: string; address: string; score: number | null }[];
  needAction: { id: string; address: string; stage: string }[];
}

export function ExecutiveView({
  a, priorities, byMonth, dispo,
}: {
  a: Analytics;
  priorities: Priorities;
  byMonth: { month: string; revenue: number }[];
  dispo: DispoSummary;
}) {
  const metrics = [
    { label: "Leads Found", value: a.totals.leads },
    { label: "Contacted", value: a.totals.contacted },
    { label: "Responses", value: a.totals.responses },
    { label: "Contracts", value: a.totals.contractsSigned },
    { label: "Assigned", value: a.totals.assigned },
    { label: "Closed", value: a.totals.closed },
    { label: "Total Revenue", value: formatCurrency(a.revenue.total), accent: true },
    { label: "Avg Assignment Fee", value: formatCurrency(a.revenue.avgAssignmentFee), accent: true },
  ];

  const funnel = [
    { label: "Found", value: a.funnel.found },
    { label: "Contacted", value: a.funnel.contacted },
    { label: "Responded", value: a.funnel.responded },
    { label: "Interested", value: a.funnel.interested },
    { label: "Contract", value: a.funnel.contractSigned },
    { label: "Closed", value: a.funnel.closed },
  ];
  const fMax = Math.max(1, ...funnel.map((f) => f.value));
  const mMax = Math.max(1, ...byMonth.map((m) => m.revenue));

  return (
    <div className="space-y-6">
      {/* 8 top metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label} className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{m.label}</div>
            <div className={`mt-1 font-heading text-2xl tracking-wide ${m.accent ? "text-[#00ff87]" : ""}`}>{m.value}</div>
          </Card>
        ))}
      </div>

      {/* Today's Priorities */}
      <Card className="p-5">
        <h2 className="mb-3 font-heading text-xl tracking-wide">Today&apos;s Priorities</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Link href="/follow-ups" className="rounded-lg border border-border p-4 transition hover:border-primary/50">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" /> Overdue follow-ups</div>
            <div className="mt-1 font-heading text-3xl text-[#00ff87]">{priorities.overdueFollowUps}</div>
          </Link>
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Flame className="h-4 w-4" /> Hot leads</div>
            <div className="mt-1 font-heading text-3xl">{priorities.hotLeads.length}</div>
          </div>
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><FileSignature className="h-4 w-4" /> Need action</div>
            <div className="mt-1 font-heading text-3xl">{priorities.needAction.length}</div>
          </div>
        </div>
        {priorities.needAction.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {priorities.needAction.slice(0, 5).map((d) => (
              <li key={d.id}><Link href={`/deals/${d.id}`} className="text-primary hover:underline">{d.address}</Link> — {d.stage.replace("_", " ").toLowerCase()}</li>
            ))}
          </ul>
        )}
      </Card>

      {/* Disposition pipeline */}
      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 font-heading text-xl tracking-wide">
          <Send className="h-5 w-5 text-primary" /> Disposition
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-border p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Deals out to buyers</div>
            <div className="mt-1 font-heading text-3xl">{dispo.dealsOut}</div>
          </div>
          <div className="rounded-lg border border-border p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Buyers engaged</div>
            <div className="mt-1 font-heading text-3xl">{dispo.buyersEngaged}</div>
          </div>
          <div className="rounded-lg border border-border p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Interested</div>
            <div className="mt-1 font-heading text-3xl text-warning">{dispo.interested}</div>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground"><Handshake className="h-3 w-3" /> Assigned</div>
            <div className="mt-1 font-heading text-3xl text-[#00ff87]">{dispo.assigned}</div>
          </div>
        </div>
        {dispo.awaitingAssignment.length > 0 ? (
          <div className="mt-4">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Awaiting your pick</div>
            <ul className="space-y-1 text-sm">
              {dispo.awaitingAssignment.map((d) => (
                <li key={d.dealId} className="flex items-center justify-between gap-3">
                  <Link href={`/deals/${d.dealId}`} className="truncate text-primary hover:underline">{d.address}</Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {d.interested > 0 && <span className="text-warning">{d.interested} interested</span>}
                    {d.interested > 0 && d.sent > 0 && " · "}
                    {d.sent > 0 && `${d.sent} sent`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : dispo.buyersEngaged === 0 && dispo.assigned === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No deals out to buyers yet — send a deal sheet from a deal&apos;s Buyer Matches.</p>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Conversion funnel */}
        <Card className="p-5">
          <h3 className="mb-3 font-heading text-lg tracking-wide">Conversion Funnel</h3>
          <div className="space-y-2">
            {funnel.map((f) => (
              <div key={f.label} className="flex items-center gap-3">
                <div className="w-20 shrink-0 text-sm text-muted-foreground">{f.label}</div>
                <div className="h-6 flex-1 overflow-hidden rounded bg-muted/40">
                  <div className="flex h-full items-center justify-end rounded bg-primary/70 px-2 text-xs font-semibold text-primary-foreground" style={{ width: `${Math.max(6, (f.value / fMax) * 100)}%` }}>{f.value}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Revenue by month */}
        <Card className="p-5">
          <h3 className="mb-3 font-heading text-lg tracking-wide">Revenue by Month</h3>
          {byMonth.length === 0 ? (
            <p className="text-sm text-muted-foreground">No closed revenue yet — your first deal starts this chart.</p>
          ) : (
            <div className="flex items-end gap-2" style={{ height: 140 }}>
              {byMonth.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t bg-[#00ff87]/70" style={{ height: `${Math.max(4, (m.revenue / mMax) * 110)}px` }} />
                  <div className="text-[10px] text-muted-foreground">{m.month.slice(5)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Source performance */}
        <Card className="p-5">
          <h3 className="mb-3 font-heading text-lg tracking-wide">Lead Source Performance</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="pb-2">Source</th><th className="pb-2 text-right">Deals</th><th className="pb-2 text-right">Close %</th><th className="pb-2 text-right">Revenue</th>
            </tr></thead>
            <tbody>
              {a.revenue.bySource.slice(0, 8).map((s) => (
                <tr key={s.source} className="border-t border-border">
                  <td className="py-1.5">{s.source}</td>
                  <td className="py-1.5 text-right">{s.deals}</td>
                  <td className="py-1.5 text-right">{s.closeRate}%</td>
                  <td className="py-1.5 text-right">{formatCurrency(s.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Revenue by ZIP */}
        <Card className="p-5">
          <h3 className="mb-3 font-heading text-lg tracking-wide">Revenue by ZIP</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="pb-2">ZIP</th><th className="pb-2 text-right">Deals</th><th className="pb-2 text-right">Closed</th><th className="pb-2 text-right">Revenue</th>
            </tr></thead>
            <tbody>
              {a.revenue.byZip.slice(0, 8).map((z) => (
                <tr key={z.zip} className="border-t border-border">
                  <td className="py-1.5">{z.zip}</td>
                  <td className="py-1.5 text-right">{z.deals}</td>
                  <td className="py-1.5 text-right">{z.closed}</td>
                  <td className="py-1.5 text-right">{formatCurrency(z.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
