import { NextResponse } from "next/server";
import { getCommandFeed } from "@/lib/command/feed";
import { apiOk } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → the Executive OS feed (briefing + Decisions/Risks/Opportunities). */
export async function GET() {
  const feed = await getCommandFeed();
  return NextResponse.json(apiOk(feed));
}
