import { NextResponse } from "next/server";
import { readBriefing } from "@/lib/data/briefing-store";
import { apiOk } from "@/types";

export const dynamic = "force-dynamic";

/** GET /api/cron/briefing — return the latest stored daily briefing (if any). */
export async function GET() {
  const briefing = readBriefing();
  return NextResponse.json(apiOk({ briefing }));
}
