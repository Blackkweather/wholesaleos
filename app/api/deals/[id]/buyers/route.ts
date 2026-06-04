import { NextResponse } from "next/server";
import { getDeal } from "@/lib/data/deals";
import { matchBuyersForDealScored } from "@/lib/data/buyers";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → ranked buyer matches with confidence % for this deal. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });
  const matches = await matchBuyersForDealScored(deal);
  return NextResponse.json(apiOk({ matches, count: matches.length }));
}
