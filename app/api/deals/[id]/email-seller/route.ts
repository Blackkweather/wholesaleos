import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDeal, updateDeal } from "@/lib/data/deals";
import { sendSellerIntroEmail } from "@/lib/resend";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST → send the intro email to the seller (CAN-SPAM compliant: includes an
 * opt-out). Human-approved: only fires when the user clicks "Email seller".
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });
  if (!deal.ownerEmail) {
    return NextResponse.json(apiError("No seller email on file — run a skip trace first."), { status: 400 });
  }

  const ok = await sendSellerIntroEmail(deal);
  if (!ok) return NextResponse.json(apiError("Could not send (is email configured?)."), { status: 400 });

  try {
    await prisma.activity.create({
      data: { dealId: deal.id, type: "EMAIL_SENT", content: `✉️ Intro email sent to ${deal.ownerEmail}.` },
    });
    await updateDeal(deal.id, { stage: "CONTACTED" });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json(apiOk({ message: `Intro email sent to ${deal.ownerEmail}`, to: deal.ownerEmail }));
}
