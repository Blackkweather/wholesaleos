import { NextRequest, NextResponse } from "next/server";
import { getAIHealth, pingProvider, isAIConfigured } from "@/lib/ai/gateway";
import type { AIProviderId } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/test/ai-health        → in-process health snapshot (no external calls)
 * GET /api/test/ai-health?ping=1 → live one-token probe of every provider tier
 */
export async function GET(req: NextRequest) {
  const ping = req.nextUrl.searchParams.get("ping") === "1";

  if (ping) {
    const ids: AIProviderId[] = ["primary", "fallback", "emergency"];
    const pings = await Promise.all(ids.map((id) => pingProvider(id)));
    return NextResponse.json({
      configured: isAIConfigured(),
      pinged: true,
      providers: getAIHealth(),
      pings,
    });
  }

  return NextResponse.json({
    configured: isAIConfigured(),
    pinged: false,
    providers: getAIHealth(),
  });
}
