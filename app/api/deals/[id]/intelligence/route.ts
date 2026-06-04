import { NextResponse } from "next/server";
import { getSellerIntelligence } from "@/lib/data/seller-intel";
import { apiOk } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const intel = await getSellerIntelligence(params.id);
  return NextResponse.json(apiOk(intel));
}
