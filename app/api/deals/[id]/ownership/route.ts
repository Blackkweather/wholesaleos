import { NextResponse } from "next/server";
import { getDeal, updateDeal } from "@/lib/data/deals";
import { lookupOwnership } from "@/lib/data/ownership";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found"), { status: 404 });

  if (deal.ownerHistory && deal.ownerCount) {
    return NextResponse.json(apiOk({
      ownerCount: deal.ownerCount,
      owners: deal.ownerHistory,
      cached: true,
    }));
  }

  if (!deal.address || !deal.city) {
    return NextResponse.json(apiOk({ ownerCount: 0, owners: [], cached: false }));
  }

  const result = await lookupOwnership(deal.address, deal.city, deal.state ?? "TX", deal.zipCode ?? undefined);

  if (result.owners.length > 0) {
    await updateDeal(params.id, {
      ownerCount: result.ownerCount,
      ownerHistory: result.owners,
    });
  }

  return NextResponse.json(apiOk({
    ownerCount: result.ownerCount,
    owners: result.owners,
    provider: result.provider,
    cached: false,
  }));
}
