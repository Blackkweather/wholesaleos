import { NextRequest, NextResponse } from "next/server";
import { getLatestBriefing, generateBriefing, type BriefingKind } from "@/lib/briefing/weekly";
import { apiOk } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?kind=&fresh=1 → latest briefing (or generate a fresh one). */
export async function GET(req: NextRequest) {
  const kindParam = req.nextUrl.searchParams.get("kind");
  const kind: BriefingKind | undefined = kindParam === "weekly" ? "weekly" : kindParam === "daily" ? "daily" : undefined;
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";

  const briefing = fresh ? await generateBriefing(kind ?? "daily") : await getLatestBriefing(kind);
  return NextResponse.json(apiOk({ briefing }));
}
