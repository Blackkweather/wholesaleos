import { inngest } from "../client";
import { getDeal, dealViewToContext } from "@/lib/data/deals";
import { generateScript } from "@/lib/claude";
import { saveScript, hasScript } from "@/lib/data/scripts";
import { isDbReady } from "@/lib/data/db";
import { prisma } from "@/lib/prisma";
import { captureDeadLetter } from "../dead-letter";

/**
 * lead.qualified → pre-draft first-contact outreach so it's ready the moment the
 * operator opens the deal. Drafts only — nothing is sent (cold outreach is
 * human-initiated per TCPA). A text draft is always prepared; a direct-mail
 * letter is added when there's a mailing target (absentee owners).
 */
export const leadQualified = inngest.createFunction(
  {
    id: "lead-qualified",
    name: "Lead Qualified",
    concurrency: 5,
    onFailure: async ({ event, error }) => {
      await captureDeadLetter({ event: "lead.qualified", payload: event.data?.event?.data ?? {}, error: error?.message ?? "unknown" });
    },
  },
  { event: "lead.qualified" },
  async ({ event, step }) => {
    const deal = await step.run("load", () => getDeal(event.data.dealId));
    if (!deal) return { skipped: "deal-not-found" };

    const drafted = await step.run("draft-outreach", async () => {
      const out: string[] = [];
      const ctx = dealViewToContext(deal);

      if (deal.ownerPhone && !(await hasScript(deal.id, "TEXT"))) {
        const text = await generateScript(ctx, "TEXT");
        if (await saveScript(deal.id, "TEXT", text)) out.push("TEXT");
      }

      const absentee = (deal.tags ?? []).includes("absentee-owner");
      if (absentee && deal.ownerName && !(await hasScript(deal.id, "LETTER"))) {
        const letter = await generateScript(ctx, "LETTER");
        if (await saveScript(deal.id, "LETTER", letter)) out.push("LETTER");
      }

      if (out.length > 0 && (await isDbReady())) {
        await prisma.activity.create({
          data: {
            dealId: deal.id,
            type: "NOTE",
            content: `✍️ Outreach drafted (${out.join(", ")}) — review and send from the deal page.`,
          },
        });
      }
      return out;
    });

    return { dealId: deal.id, score: event.data.score, drafted };
  },
);
