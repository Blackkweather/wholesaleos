import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDeal } from "@/lib/data/deals";
import { autoStartSequenceForDeal } from "@/lib/data/sms";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST → start the automated SMS drip for this deal.
 *
 * Human-approved by design: this only runs when the user clicks
 * "Start automated drip" on the deal page. It queues the AI-written
 * sequence; the hourly `sms-drip` cron sends each message on cadence.
 * Nothing is texted to a lead the user hasn't explicitly approved here.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });

  const result = await autoStartSequenceForDeal(deal);

  if (!result.started) {
    // 409 for "already running", 400 for everything the user can fix
    const status = result.reason === "already-active" ? 409 : 400;
    return NextResponse.json(apiError(result.message), { status });
  }

  // Log to the deal's activity feed + advance the stage if still pre-contact
  try {
    await prisma.activity.create({
      data: {
        dealId: deal.id,
        type: "NOTE",
        content: `📱 Automated text sequence started (${result.queued ?? 0} messages) — you approved this lead.`,
      },
    });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json(apiOk(result));
}
