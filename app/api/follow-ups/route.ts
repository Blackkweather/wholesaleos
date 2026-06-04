import { NextResponse } from "next/server";
import { getFollowUpQueue } from "@/lib/data/follow-ups";
import { apiOk } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The Follow-Up Queue. ?due=1 limits to due/overdue only. */
export async function GET(req: Request) {
  const dueOnly = new URL(req.url).searchParams.get("due") === "1";
  const queue = await getFollowUpQueue({ dueOnly });
  return NextResponse.json(apiOk({ queue, total: queue.length }));
}
