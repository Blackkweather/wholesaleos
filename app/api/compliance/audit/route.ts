import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin-auth";
import { listAudit } from "@/lib/compliance/audit";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?limit=&action= → recent immutable audit records. */
export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json(apiError(auth.error), { status: auth.status });

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 100);
  const action = req.nextUrl.searchParams.get("action") ?? undefined;
  const rows = await listAudit(Number.isFinite(limit) ? limit : 100, action);
  return NextResponse.json(apiOk({ count: rows.length, rows }));
}
