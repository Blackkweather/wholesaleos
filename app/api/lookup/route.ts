import { NextResponse } from "next/server";
import { verifyProperty } from "@/lib/property-data";
import { skipTrace, isApifyConfigured, type SkipTraceResult } from "@/lib/skipTrace";
import { apiOk, apiError } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { address, city?, state? } → look up ANY property:
 *  1. Verify owner + value from county records (Census + HCAD) — fast, real.
 *  2. Skip trace the owner for phone(s) + email(s) (Apify) — time-boxed.
 * Returns everything you need to decide whether to work the lead.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { address?: string; city?: string; state?: string };
  const address = (body.address ?? "").trim();
  if (!address) return NextResponse.json(apiError("Enter a property address."), { status: 400 });
  const city = (body.city ?? "Houston").trim() || "Houston";
  const state = (body.state ?? "TX").trim() || "TX";

  // 1) Owner + value from county records — authoritative, kills fake addresses
  const v = await verifyProperty(address, city, state);
  if (!v) {
    return NextResponse.json(apiOk({
      found: false,
      message: "Couldn't find that address in county records — check the spelling or use the full street address.",
    }));
  }

  // 2) Contacts via skip trace — time-boxed to 45s so the whole call fits 60s
  let contacts: SkipTraceResult = { phones: [], emails: [], confidence: 0, source: null };
  if (isApifyConfigured() && v.ownerName) {
    const traced = await Promise.race([
      skipTrace({ ownerName: v.ownerName, address: v.normalizedAddress ?? address, city, state, zip: v.zip ?? undefined }),
      new Promise<null>((r) => setTimeout(() => r(null), 45000)),
    ]);
    if (traced) contacts = traced;
  }

  return NextResponse.json(apiOk({
    found: true,
    property: {
      address: v.normalizedAddress ?? address,
      city,
      state,
      zip: v.zip ?? null,
      ownerName: v.ownerName ?? null,
      estValue: v.estValue ?? null,
      absentee: Boolean(v.absentee),
      mailAddress: v.mailAddress ?? null,
      provider: v.provider ?? null,
    },
    contacts,
    apifyReady: isApifyConfigured(),
  }));
}
