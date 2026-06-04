import { NextRequest, NextResponse } from "next/server";
import { isDbReady } from "@/lib/data/db";
import { listDeals } from "@/lib/data/deals";
import { skipTraceAndUpdate } from "@/lib/data/skip-trace";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby cap — process a small batch per run.

function authCheck(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

/**
 * Batched skip tracing — backfills owner phone/email a few deals at a time so it
 * fits inside Vercel's 60s function budget. Discovery (daily-scan) stays fast;
 * this slow external-API work runs separately on its own schedule.
 *
 * Picks the highest-scored deals that still have no phone, traces up to
 * SKIP_TRACE_BATCH (default 3) of them, and updates the records. Idempotent:
 * already-traced deals are skipped automatically (they have a phone).
 */
// Vercel native cron / free cron services trigger a GET. Delegate to POST.
export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json(apiError("Unauthorized"), { status: 401 });
  if (!(await isDbReady())) return NextResponse.json(apiOk({ traced: 0, skipped: "no-db" }));

  const batchSize = Math.max(1, Math.min(10, Number(process.env.SKIP_TRACE_BATCH) || 3));

  const candidates = (await listDeals())
    .filter((d) => !d.ownerPhone && d.stage !== "DEAD" && !d.optedOut)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, batchSize);

  let traced = 0;
  const errors: string[] = [];
  for (const deal of candidates) {
    try {
      const hit = await skipTraceAndUpdate(deal);
      if (hit) traced++;
    } catch (e) {
      errors.push(`${deal.address}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json(apiOk({ considered: candidates.length, traced, errors }));
}
