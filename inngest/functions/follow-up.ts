import { inngest } from "../client";
import { getDeal, dealViewToContext } from "@/lib/data/deals";
import { generateScript } from "@/lib/claude";
import { createSurfaceItem } from "@/lib/surfacing/engine";
import { FOLLOWUP_CADENCE_DAYS } from "@/lib/data/follow-ups";
import { STAGE_ORDER, type StageKey } from "@/constants/config";
import { captureDeadLetter } from "../dead-letter";

const CONTACTED_ORDER = STAGE_ORDER.CONTACTED;

/**
 * Durable per-deal follow-up cadence. Started when a deal reaches CONTACTED, it
 * sleeps through [3, 7, 14, 30, 60]-day touches. At each touch it drafts the next
 * message and surfaces a (suppressible) follow-up — the operator sends it
 * (the seller hasn't opted in, so it stays human-initiated). The cadence stops
 * the moment the seller responds, the deal advances/dies, or they opt out.
 *
 * Idempotent per deal: only one follow-up flow runs at a time per dealId.
 */
export const followUp = inngest.createFunction(
  {
    id: "follow-up",
    name: "Follow-Up Cadence",
    idempotency: "event.data.dealId",
    onFailure: async ({ event, error }) => {
      await captureDeadLetter({ event: "followup.start", payload: event.data?.event?.data ?? {}, error: error?.message ?? "unknown" });
    },
  },
  { event: "followup.start" },
  async ({ event, step }) => {
    const dealId = event.data.dealId;
    let prevDay = 0;

    for (const day of FOLLOWUP_CADENCE_DAYS) {
      await step.sleep(`wait-to-day-${day}`, `${day - prevDay}d`);
      prevDay = day;

      const status = await step.run(`followup-day-${day}`, async () => {
        const deal = await getDeal(dealId);
        if (!deal) return "gone";
        if (deal.optedOut) return "opted-out";

        const order = STAGE_ORDER[deal.stage as StageKey] ?? 0;
        if (order !== CONTACTED_ORDER) return "progressed"; // seller engaged / deal moved or died

        const draft = await generateScript(dealViewToContext(deal), "TEXT", "follow-up");
        await createSurfaceItem({
          kind: "RISK",
          dealId: deal.id,
          score: {
            valueAtStake: deal.expectedProfit ?? deal.profit ?? 0,
            urgency: 0.6,
            confidence: 0.4,
            novelty: 1,
            humanRequired: false, // suppressible — the adaptive threshold ranks it
          },
          batchKey: `followup:${deal.id}:${day}`,
          recommendation: { address: deal.address, followUpDay: day, draft: draft.slice(0, 240) },
          defaultAction: { action: "send-followup" },
        });
        return "surfaced";
      });

      if (status !== "surfaced") return { dealId, stoppedAt: day, reason: status };
      await step.sendEvent(`followup-due-${day}`, { name: "followup.due", data: { dealId } });
    }

    return { dealId, completed: true };
  },
);
