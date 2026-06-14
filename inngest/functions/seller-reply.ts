import { inngest } from "../client";
import { getDeal } from "@/lib/data/deals";
import { createSurfaceItem } from "@/lib/surfacing/engine";
import { captureDeadLetter } from "../dead-letter";

/**
 * seller.replied → a live seller conversation needs the operator. Surfaces a
 * RISK item (recall-optimized) so an engaged seller never goes unnoticed.
 * Inbound content is treated as untrusted data — never used as instructions.
 */
export const sellerReply = inngest.createFunction(
  {
    id: "seller-reply",
    name: "Seller Reply",
    concurrency: 5,
    onFailure: async ({ event, error }) => {
      await captureDeadLetter({ event: "seller.replied", payload: event.data?.event?.data ?? {}, error: error?.message ?? "unknown" });
    },
  },
  { event: "seller.replied" },
  async ({ event, step }) => {
    const deal = await step.run("load", () => getDeal(event.data.dealId));
    if (!deal) return { skipped: "deal-not-found" };

    await step.run("surface-risk", () =>
      createSurfaceItem({
        kind: "RISK",
        dealId: deal.id,
        score: {
          valueAtStake: deal.expectedProfit ?? deal.profit ?? 0,
          urgency: 0.9, // a live reply is time-sensitive
          confidence: 0.3, // the system can't close the loop alone
          novelty: 1,
          humanRequired: true,
        },
        moneyExempt: true, // an engaged seller always surfaces
        batchKey: `seller-reply:${deal.id}`,
        recommendation: { address: deal.address, contact: event.data.contact, said: event.data.body.slice(0, 240) },
        defaultAction: { action: "await-operator" },
      }),
    );

    return { dealId: deal.id, surfaced: true };
  },
);
