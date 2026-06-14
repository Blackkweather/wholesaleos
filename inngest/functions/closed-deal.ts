import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "@/lib/data/db";
import { recalibrateThreshold } from "@/lib/surfacing/engine";
import { captureDeadLetter } from "../dead-letter";

/**
 * deal.closed → record the outcome (feeds calibration + learning) and
 * recalibrate the surfacing threshold against the latest activity.
 */
export const closedDeal = inngest.createFunction(
  {
    id: "closed-deal",
    name: "Closed Deal",
    onFailure: async ({ event, error }) => {
      await captureDeadLetter({ event: "deal.closed", payload: event.data?.event?.data ?? {}, error: error?.message ?? "unknown" });
    },
  },
  { event: "deal.closed" },
  async ({ event, step }) => {
    const dealId = event.data.dealId;

    await step.run("record-outcome", async () => {
      if (!(await isDbReady())) return;
      const deal = await prisma.deal.findUnique({
        where: { id: dealId },
        select: { marketId: true, expectedProfit: true, actualProfit: true },
      });
      if (!deal) return;
      await prisma.outcome.upsert({
        where: { dealId },
        create: {
          dealId,
          marketId: deal.marketId ?? null,
          closed: true,
          predictedFee: deal.expectedProfit ?? null,
          actualFee: deal.actualProfit ?? null,
        },
        update: {
          closed: true,
          marketId: deal.marketId ?? undefined,
          predictedFee: deal.expectedProfit ?? undefined,
          actualFee: deal.actualProfit ?? undefined,
        },
      });
    });

    await step.run("recalibrate", () => recalibrateThreshold());
    return { dealId, recorded: true };
  },
);
