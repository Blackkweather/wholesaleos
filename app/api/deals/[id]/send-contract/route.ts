import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDeal, updateDeal } from "@/lib/data/deals";
import { sendContractForSignature } from "@/lib/data/esign";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { agreedPrice? } → route the purchase agreement to the seller for signature.
 * Human-approved: only runs when the user clicks "Send for Signature".
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });

  const body = await req.json().catch(() => ({})) as { agreedPrice?: number };
  const result = await sendContractForSignature(deal, body.agreedPrice);

  if (!result.sent) {
    return NextResponse.json(apiError(result.error ?? "Could not send contract."), { status: 400 });
  }

  // Record the offer + advance the stage (auto-stamps offer_date)
  try {
    if (typeof body.agreedPrice === "number") {
      await prisma.deal.update({ where: { id: deal.id }, data: { offerPrice: body.agreedPrice } });
    }
    await updateDeal(deal.id, { stage: "OFFER_SENT" });
    await prisma.activity.create({
      data: {
        dealId: deal.id,
        type: "EMAIL_SENT",
        content: `📄 Purchase agreement sent to ${result.to} for signature (${result.channel}).`,
      },
    });
  } catch (e) {
    console.error("send-contract post-actions error", e);
  }

  return NextResponse.json(apiOk(result));
}
