import { NextResponse } from "next/server";
import { getDeal } from "@/lib/data/deals";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function money(n?: number | null): string {
  if (!n) return "TBD";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Generates a clean, shareable JV lead pack for a deal.
 * Send this to a partner wholesaler to split (50/50) or sell the lead outright.
 * GET /api/deals/[id]/lead-pack  →  { text, deal }
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });

  // Estimated assignment fee = what a partner would pay you, or your split
  const fee = deal.assignmentFee ?? 10000;
  const yourSplit = Math.round(fee / 2);

  // Plain-text pack — copy/paste into SMS, email, or a Facebook message
  const text = `🏠 WHOLESALE LEAD — ${deal.city ?? "Houston"}, ${deal.state ?? "TX"}

PROPERTY: ${deal.address}
TYPE: ${deal.dealType ?? "Motivated seller"}
${deal.situation ? `SITUATION: ${deal.situation}` : ""}

THE NUMBERS
• ARV (after-repair value): ${money(deal.arv)}
• Est. repairs: ${money(deal.repairCost)}
• Target offer (MAO): ${money(deal.offerPrice)}
• Est. assignment fee: ${money(fee)}
• AI lead score: ${deal.score ?? "—"}/100 ${deal.verdict ? `(${deal.verdict})` : ""}

${deal.ownerName ? `OWNER: ${deal.ownerName}` : ""}
${deal.ownerPhone ? `PHONE: ${deal.ownerPhone}` : "PHONE: (skip-trace in progress)"}
${deal.ownerEmail ? `EMAIL: ${deal.ownerEmail}` : ""}

${deal.aiSummary ? `WHY IT'S A DEAL:\n${deal.aiSummary}\n` : ""}
JV TERMS
I bring the qualified lead, you close it with your buyer + paperwork.
Proposed split: 50/50 on the assignment fee (~${money(yourSplit)} each).
Or buy the lead outright. Let's talk.

— Sent via WholesaleOS`;

  return NextResponse.json(apiOk({
    text,
    deal: {
      address: deal.address,
      score: deal.score,
      offerPrice: deal.offerPrice,
      assignmentFee: fee,
      yourSplit,
    },
  }));
}
