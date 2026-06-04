import { getAnalytics } from "@/lib/data/analytics";
import { getFollowUpQueue } from "@/lib/data/follow-ups";
import { listDeals } from "@/lib/data/deals";
import { getDispoSummary } from "@/lib/data/disposition";
import { ExecutiveView } from "@/components/dashboard/executive-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Executive" };

const ACTION_STAGES = new Set(["APPOINTMENT_SCHEDULED", "OFFER_SENT", "NEGOTIATING", "CONTRACT_SIGNED"]);

export default async function ExecutivePage() {
  const [a, queue, deals, dispo] = await Promise.all([
    getAnalytics(),
    getFollowUpQueue({ dueOnly: true }),
    listDeals(),
    getDispoSummary(),
  ]);

  // Revenue by month (from closed deals)
  const monthMap = new Map<string, number>();
  for (const d of deals) {
    if (d.closingDate) {
      const m = d.closingDate.slice(0, 7);
      monthMap.set(m, (monthMap.get(m) ?? 0) + (d.actualProfit ?? d.assignmentFee ?? d.profit ?? 0));
    }
  }
  const byMonth = Array.from(monthMap.entries()).sort().map(([month, revenue]) => ({ month, revenue }));

  const priorities = {
    overdueFollowUps: queue.length,
    hotLeads: deals.filter((d) => d.hot && d.stage !== "DEAD").map((d) => ({ id: d.id, address: d.address, score: d.score })),
    needAction: deals.filter((d) => ACTION_STAGES.has(d.stage)).map((d) => ({ id: d.id, address: d.address, stage: d.stage })),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl tracking-wide">Executive</h1>
        <p className="text-sm text-muted-foreground">Your business at a glance — revenue, conversion, and what needs you today.</p>
      </div>
      <ExecutiveView a={a} priorities={priorities} byMonth={byMonth} dispo={dispo} />
    </div>
  );
}
