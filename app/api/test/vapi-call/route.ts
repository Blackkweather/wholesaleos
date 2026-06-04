import { NextRequest, NextResponse } from "next/server";
import { makeOutboundCall } from "@/lib/vapi";
import { getDeal, listDeals } from "@/lib/data/deals";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Test endpoint — triggers a real Vapi call to a given phone number.
 * POST /api/test/vapi-call  { phone: "+212720155047", dealId?: "..." }
 */
export async function POST(req: NextRequest) {
  const { phone, dealId } = await req.json() as { phone: string; dealId?: string };

  if (!phone) return NextResponse.json(apiError("phone required"), { status: 400 });

  // Get deal for context (use specified or best scored)
  let deal = dealId ? await getDeal(dealId) : null;
  if (!deal) {
    const all = await listDeals();
    deal = all.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null;
  }
  if (!deal) return NextResponse.json(apiError("No deals in DB"), { status: 404 });

  // Override phone for the test
  const testDeal = { ...deal, ownerPhone: phone, ownerName: deal.ownerName ?? "Test Seller" };

  let result;
  try {
    result = await makeOutboundCall(testDeal);
  } catch (e) {
    return NextResponse.json(apiError(e instanceof Error ? e.message : "Vapi call failed"), { status: 500 });
  }
  if (!result) return NextResponse.json(apiError("Vapi call failed — check VAPI_API_KEY"), { status: 500 });

  return NextResponse.json(apiOk({
    callId:  result.callId,
    status:  result.status,
    deal:    deal.address,
    calledTo: phone,
  }));
}
