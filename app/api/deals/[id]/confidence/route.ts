import { NextResponse } from "next/server";
import { getDeal } from "@/lib/data/deals";
import { assessDeal } from "@/lib/confidence/gate";
import { scoreWithConfidence } from "@/lib/confidence/score";
import { matchConfidence } from "@/lib/confidence/match";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "@/lib/data/db";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → full Data Confidence bundle for a deal (ARV/repair/offer/score/match + gate). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });

  let marketId: string | null = null;
  if (await isDbReady()) {
    const row = await prisma.deal.findUnique({ where: { id: deal.id }, select: { marketId: true } });
    marketId = row?.marketId ?? null;
  }

  const [bundle, score, match] = await Promise.all([
    assessDeal(deal, marketId),
    scoreWithConfidence(deal),
    matchConfidence(deal),
  ]);

  return NextResponse.json(
    apiOk({
      dealId: deal.id,
      autoActBlocked: !bundle.gate.allowed,
      gate: bundle.gate,
      arv: bundle.arv,
      repair: bundle.repair,
      offer: bundle.offer,
      score,
      match,
      calibration: bundle.drift,
    }),
  );
}
