import { NextResponse } from "next/server";
import { getDeal } from "@/lib/data/deals";
import { scoreDealHybrid } from "@/lib/data/scoring";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → hybrid score breakdown (components + plain-English reasons). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found."), { status: 404 });
  const result = await scoreDealHybrid(deal);
  return NextResponse.json(apiOk(result));
}
