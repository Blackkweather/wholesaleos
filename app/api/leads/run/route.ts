import { NextRequest, NextResponse } from "next/server";
import { runLeadSource } from "@/lib/lead-sources";
import { getActiveMarket } from "@/lib/data/markets";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** POST { source, limit? } → run a lead-source adapter through verification & save. */
export async function POST(req: NextRequest) {
  let body: { source?: string; limit?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(apiError("Invalid request."), { status: 400 });
  }
  if (!body.source) return NextResponse.json(apiError("source required."), { status: 400 });

  const market = await getActiveMarket();
  const city = market?.city ?? "Houston";
  const state = market?.state ?? "TX";

  try {
    const result = await runLeadSource(body.source, { city, state, limit: body.limit });
    return NextResponse.json(apiOk(result));
  } catch (e) {
    console.error("leads/run error", e);
    return NextResponse.json(apiError(e instanceof Error ? e.message : "Lead source failed."), { status: 500 });
  }
}
