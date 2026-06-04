import { NextResponse } from "next/server";
import { getDeal } from "@/lib/data/deals";
import { analyzeDeal } from "@/lib/claude";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) {
    return NextResponse.json(apiError("Deal not found."), { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    const analysis = await analyzeDeal({
      address: deal.address,
      city: deal.city ?? undefined,
      arv: deal.arv ?? undefined,
      repairCost: deal.repairCost ?? undefined,
      offerPrice: deal.offerPrice ?? undefined,
      assignmentFee: deal.assignmentFee ?? undefined,
      withComps: Boolean(body?.withComps),
    });
    return NextResponse.json(apiOk({ analysis }));
  } catch (e) {
    console.error("analyze error", e);
    return NextResponse.json(apiError("Could not analyze deal."), {
      status: 500,
    });
  }
}
