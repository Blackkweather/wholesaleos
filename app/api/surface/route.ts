import { NextRequest, NextResponse } from "next/server";
import { listOpenSurface } from "@/lib/surfacing/engine";
import type { SurfaceKind } from "@/lib/surfacing/score";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = ["DECISION", "RISK", "OPPORTUNITY"] as const;

/** GET ?kind= → open surface items (money-exempt first, then by score). */
export async function GET(req: NextRequest) {
  const kindParam = req.nextUrl.searchParams.get("kind");
  const kind = kindParam && (KINDS as readonly string[]).includes(kindParam) ? (kindParam as SurfaceKind) : undefined;
  if (kindParam && !kind) {
    return NextResponse.json(apiError("kind must be DECISION, RISK, or OPPORTUNITY."), { status: 400 });
  }
  const items = await listOpenSurface(kind);
  return NextResponse.json(apiOk({ count: items.length, items }));
}
