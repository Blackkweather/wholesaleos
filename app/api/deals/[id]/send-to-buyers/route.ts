import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDeal } from "@/lib/data/deals";
import { sendDealToBuyers } from "@/lib/data/disposition";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/**
 * POST { buyerIds } → email the deal sheet to the selected cash buyers.
 * Human-approved: only fires when the user clicks "Send to buyers", and only
 * reaches buyers already on their own list.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { buyerIds?: string[] };
  const result = await sendDealToBuyers(deal, body.buyerIds ?? []);

  if (result.sent === 0) {
    return NextResponse.json(apiError(result.error ?? "Could not send to any buyers."), { status: 400 });
  }

  try {
    await prisma.activity.create({
      data: {
        dealId: deal.id,
        type: "EMAIL_SENT",
        content: `📤 Deal sheet sent to ${result.sent} buyer${result.sent === 1 ? "" : "s"} at ${money(result.buyerPrice)}.`,
      },
    });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json(apiOk(result));
}
