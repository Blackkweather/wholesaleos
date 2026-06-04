import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDbReady, CURRENT_USER_ID } from "@/lib/data/db";
import { verifyProperty } from "@/lib/property-data";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authCheck(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

/**
 * Backfill real owner data (Census + HCAD) across existing deals that are
 * missing it, and quarantine (stage=DEAD) any whose address can't be verified.
 * Non-destructive: nothing is deleted, only updated/flagged.
 */
export async function POST(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json(apiError("Unauthorized"), { status: 401 });
  if (!(await isDbReady())) return NextResponse.json(apiOk({ skipped: "no-db" }));

  const deals = await prisma.deal.findMany({
    where: { userId: CURRENT_USER_ID, ownerName: null, stage: { not: "DEAD" } },
    select: { id: true, address: true, city: true, state: true, tags: true },
  });

  let enriched = 0, quarantined = 0, kept = 0;

  for (const d of deals) {
    try {
      const real = await verifyProperty(d.address, d.city ?? "", d.state ?? "Texas");
      if (real === null) {
        // Address doesn't exist → quarantine (reversible, not deleted)
        await prisma.deal.update({
          where: { id: d.id },
          data: { stage: "DEAD", tags: Array.from(new Set([...d.tags, "unverified-address"])) },
        });
        quarantined++;
      } else {
        const tags = new Set([...d.tags, "verified", real.provider]);
        if (real.absentee) tags.add("absentee-owner");
        if (real.mailAddress) tags.add(`mail: ${real.mailAddress}`);
        await prisma.deal.update({
          where: { id: d.id },
          data: {
            address: real.normalizedAddress ?? d.address,
            ownerName: real.ownerName ?? undefined,
            arv: real.estValue ?? undefined,
            source: "verified",
            tags: Array.from(tags),
          },
        });
        enriched++;
      }
    } catch {
      kept++; // transient API error → leave it untouched
    }
  }

  return NextResponse.json(apiOk({ processed: deals.length, enriched, quarantined, kept }));
}
