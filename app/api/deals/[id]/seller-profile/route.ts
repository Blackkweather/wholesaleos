import { NextRequest, NextResponse } from "next/server";
import { getDeal, updateDeal } from "@/lib/data/deals";
import { apiOk, apiError } from "@/types";
import type { SellerProfile } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found"), { status: 404 });
  return NextResponse.json(apiOk(deal.sellerProfile ?? {}));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const deal = await getDeal(params.id);
  if (!deal) return NextResponse.json(apiError("Deal not found"), { status: 404 });

  const body = (await req.json()) as Partial<SellerProfile>;
  const existing = (deal.sellerProfile ?? {}) as SellerProfile;
  const merged: SellerProfile = { ...existing, ...body, lastUpdated: new Date().toISOString() };

  const updated = await updateDeal(params.id, { sellerProfile: merged });
  if (!updated) return NextResponse.json(apiError("Update failed"), { status: 500 });

  return NextResponse.json(apiOk(merged));
}
