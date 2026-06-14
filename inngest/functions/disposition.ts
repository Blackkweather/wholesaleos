import { inngest } from "../client";
import { getDeal } from "@/lib/data/deals";
import { matchBuyersForDealScored } from "@/lib/data/buyers";
import { createSurfaceItem } from "@/lib/surfacing/engine";
import { captureDeadLetter } from "../dead-letter";

/**
 * deal.contracted → build the buyer package and surface a DECISION (money-exempt)
 * for the operator to approve the blast. The system prepares; the human approves.
 */
export const disposition = inngest.createFunction(
  {
    id: "disposition",
    name: "Disposition",
    concurrency: 5,
    onFailure: async ({ event, error }) => {
      await captureDeadLetter({ event: "deal.contracted", payload: event.data?.event?.data ?? {}, error: error?.message ?? "unknown" });
    },
  },
  { event: "deal.contracted" },
  async ({ event, step }) => {
    const deal = await step.run("load", () => getDeal(event.data.dealId));
    if (!deal) return { skipped: "deal-not-found" };

    const matches = await step.run("match-buyers", () => matchBuyersForDealScored(deal));
    const top = matches.slice(0, 8).map((m) => ({
      buyer: m.buyer.company || m.buyer.name,
      confidence: m.matchScore,
      contact: m.buyer.email ?? m.buyer.phone ?? null,
    }));

    await step.run("surface-decision", () =>
      createSurfaceItem({
        kind: "DECISION",
        dealId: deal.id,
        score: {
          valueAtStake: deal.expectedProfit ?? deal.profit ?? 0,
          urgency: 0.8,
          confidence: 0.4,
          novelty: 1,
          humanRequired: true,
        },
        moneyExempt: true, // blast approval is a fiduciary gate — always surfaces
        batchKey: `dispo:${deal.id}`,
        recommendation: { address: deal.address, matchCount: matches.length, buyers: top },
        defaultAction: { action: "hold-until-approved" },
      }),
    );

    return { dealId: deal.id, matchCount: matches.length };
  },
);
