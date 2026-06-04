import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDbReady } from "@/lib/data/db";
import { listDeals } from "@/lib/data/deals";
import { getHistoricalStats, computeHybridScore } from "@/lib/data/scoring";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authCheck(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

/** Recompute the hybrid score + verdict for every deal using current outcome history. */
export async function POST(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json(apiError("Unauthorized"), { status: 401 });
  if (!(await isDbReady())) return NextResponse.json(apiOk({ skipped: "no-db" }));

  const hist = await getHistoricalStats();
  const deals = await listDeals();
  let updated = 0;

  for (const d of deals) {
    if (d.stage === "DEAD") continue;
    const s = computeHybridScore(d, hist);
    try {
      await prisma.deal.update({
        where: { id: d.id },
        data: { score: s.score, verdict: s.verdict },
      });
      updated++;
    } catch { /* skip */ }
  }

  return NextResponse.json(apiOk({ updated, hasHistory: hist.hasHistory }));
}
