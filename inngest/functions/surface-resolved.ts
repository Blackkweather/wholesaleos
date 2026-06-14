import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "@/lib/data/db";
import { getDeal } from "@/lib/data/deals";
import { matchBuyersForDealScored } from "@/lib/data/buyers";
import { sendDealToBuyers } from "@/lib/data/disposition";
import { captureDeadLetter } from "../dead-letter";

/**
 * surface.resolved → closes the approve→act loop. When the operator APPROVES a
 * disposition DECISION (batchKey "dispo:*") in Command, the buyer blast actually
 * executes (through the compliance + budget + breaker guards). The human
 * approves; the system carries it out.
 */
export const surfaceResolved = inngest.createFunction(
  {
    id: "surface-resolved",
    name: "Surface Resolved",
    onFailure: async ({ event, error }) => {
      await captureDeadLetter({ event: "surface.resolved", payload: event.data?.event?.data ?? {}, error: error?.message ?? "unknown" });
    },
  },
  { event: "surface.resolved" },
  async ({ event, step }) => {
    if (event.data.resolution !== "approved") return { skipped: "not-approved" };

    const item = await step.run("load-item", async () => {
      if (!(await isDbReady())) return null;
      return prisma.surfaceItem.findUnique({
        where: { id: event.data.id },
        select: { dealId: true, batchKey: true },
      });
    });

    if (!item?.dealId || !item.batchKey?.startsWith("dispo:")) {
      return { skipped: "not-a-disposition-decision" };
    }

    const result = await step.run("execute-blast", async () => {
      const deal = await getDeal(item.dealId!);
      if (!deal) return { error: "deal-not-found" };
      const matches = await matchBuyersForDealScored(deal);
      const buyerIds = matches.filter((m) => m.buyer.email).map((m) => m.buyer.id);
      if (buyerIds.length === 0) return { error: "no-emailable-buyers" };
      return sendDealToBuyers(deal, buyerIds);
    });

    return { dealId: item.dealId, ...result };
  },
);
