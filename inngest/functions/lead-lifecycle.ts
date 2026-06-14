import { inngest } from "../client";
import { getDeal } from "@/lib/data/deals";
import { scoreDealHybrid } from "@/lib/data/scoring";
import { createSurfaceItem } from "@/lib/surfacing/engine";
import { captureDeadLetter } from "../dead-letter";

const QUALIFY_THRESHOLD = 70;

/**
 * lead.created → score the deal; a qualifying score emits lead.qualified and
 * surfaces an OPPORTUNITY for the operator. Below threshold the lead keeps
 * flowing silently (no surface).
 */
export const leadLifecycle = inngest.createFunction(
  {
    id: "lead-lifecycle",
    name: "Lead Lifecycle",
    concurrency: 5,
    onFailure: async ({ event, error }) => {
      await captureDeadLetter({ event: "lead.created", payload: event.data?.event?.data ?? {}, error: error?.message ?? "unknown" });
    },
  },
  { event: "lead.created" },
  async ({ event, step }) => {
    const deal = await step.run("load", () => getDeal(event.data.dealId));
    if (!deal) return { skipped: "deal-not-found" };

    const scored = await step.run("score", () => scoreDealHybrid(deal));

    if (scored.score >= QUALIFY_THRESHOLD) {
      await step.run("surface-opportunity", () =>
        createSurfaceItem({
          kind: "OPPORTUNITY",
          dealId: deal.id,
          score: {
            valueAtStake: deal.expectedProfit ?? deal.profit ?? 0,
            urgency: 0.5,
            confidence: 0.5,
            novelty: 1,
            humanRequired: false,
          },
          recommendation: { address: deal.address, score: scored.score, verdict: scored.verdict, reasons: scored.reasons.slice(0, 3) },
          defaultAction: { action: "nurture" },
        }),
      );
      await step.sendEvent("qualified", { name: "lead.qualified", data: { dealId: deal.id, score: scored.score } });
    }

    return { dealId: deal.id, score: scored.score, qualified: scored.score >= QUALIFY_THRESHOLD };
  },
);
