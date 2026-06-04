import { NextResponse } from "next/server";
import { getDeal, dealViewToContext } from "@/lib/data/deals";
import { generateScript } from "@/lib/claude";
import { markFollowUpSent, FOLLOWUP_CADENCE_DAYS } from "@/lib/data/follow-ups";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → AI-drafted follow-up touches (SMS, email, letter). No sending. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });

  const step = (deal.followUpStep ?? 0) + 1;
  const ctx = dealViewToContext(deal);
  const tone = `follow-up #${step} (persistent but friendly, references prior outreach, no pressure)`;

  try {
    const [sms, email, letter] = await Promise.all([
      generateScript(ctx, "TEXT", tone),
      generateScript(ctx, "EMAIL", tone),
      generateScript(ctx, "LETTER", tone),
    ]);
    return NextResponse.json(apiOk({
      step,
      maxSteps: FOLLOWUP_CADENCE_DAYS.length,
      drafts: { sms, email, letter },
    }));
  } catch (e) {
    console.error("follow-up draft error", e);
    return NextResponse.json(apiError("Could not draft follow-up."), { status: 500 });
  }
}

/** POST → record that the user approved & sent this follow-up; advance the cadence. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ok = await markFollowUpSent(params.id);
  if (!ok) return NextResponse.json(apiError("Could not record follow-up."), { status: 400 });
  return NextResponse.json(apiOk({ recorded: true }));
}
